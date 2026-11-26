import prisma from '@/lib/prisma';

export interface CheckDuplicateInput {
    title: string;
    description: string;
    district: string;
}

export interface CheckDuplicateResult {
    isDuplicate: boolean;
    similarChallengeId?: string;
    similarityScore?: number;
    similarChallengeTitle?: string;
    similarChallengeDaysAgo?: number;
}

// Minimal English and Hindi stopwords
const STOPWORDS = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'shall', 'may', 'might',
    'can', 'could', 'to', 'of', 'in', 'on', 'at', 'by', 'for', 'with', 'about',
    'from', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
    'between', 'out', 'up', 'down', 'and', 'but', 'or', 'nor', 'not', 'if',
    'then', 'else', 'while', 'where', 'when', 'how', 'what', 'which', 'who',
    'whom',
    // Hindi stopwords
    'यह', 'वह', 'में', 'से', 'के', 'की', 'को', 'है', 'हैं', 'था', 'थे',
]);

/**
 * TF-IDF cosine similarity between doc 0 and every other doc. IDF comes from the docs themselves
 * (the candidate plus the district's existing challenges), so common local words weigh less.
 * Pure function: exported for the integrity checks.
 */
export function tfidfSimilarities(docs: string[][]): number[] {
    const n = docs.length;
    const df = new Map<string, number>();
    for (const doc of docs) for (const t of new Set(doc)) df.set(t, (df.get(t) ?? 0) + 1);
    const idf = (t: string) => Math.log((n + 1) / ((df.get(t) ?? 0) + 1)) + 1;
    const vec = (doc: string[]) => {
        const tf = new Map<string, number>();
        for (const t of doc) tf.set(t, (tf.get(t) ?? 0) + 1);
        return new Map([...tf].map(([t, c]) => [t, c * idf(t)]));
    };
    const norm = (v: Map<string, number>) => Math.sqrt([...v.values()].reduce((s, x) => s + x * x, 0));
    const [first, ...rest] = docs.map(vec);
    const n0 = norm(first);
    return rest.map((v) => {
        let dot = 0;
        for (const [t, w] of first) dot += w * (v.get(t) ?? 0);
        const d = n0 * norm(v);
        return d === 0 ? 0 : dot / d;
    });
}

export class DeduplicationService {
    /**
     * Clean and tokenize input text, removing stopwords
     */
    private static tokenizeAndClean(text: string): string[] {
        if (!text) return [];
        // Replace non-alphanumeric (keeping Devanagari Unicode characters) with spaces
        const cleaned = text
            .toLowerCase()
            .replace(/[^\w\s\u0900-\u097F]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        const words = cleaned.split(' ');
        return words.filter((w) => w.length > 1 && !STOPWORDS.has(w));
    }

    /**
     * Core Algorithm:
     * 1. Accept { title, description, district }
     * 2. Combine title + first 150 chars of description into single text
     * 3. Strip common English and Hindi stopwords
     * 4. Compute TF-IDF vectors (IDF from the district's own challenges)
     * 5. Query existing challenges in same district
     * 6. Compute cosine similarity for each
     * 7. If similarity > 0.75 => isDuplicate = true
     */
    public static async checkDuplicate(input: CheckDuplicateInput): Promise<CheckDuplicateResult> {
        const { title, description, district } = input;

        // 1 & 2: Combine title + first 150 chars of description
        const combinedText = `${title || ''} ${(description || '').slice(0, 150)}`.trim();
        const candidateTokens = this.tokenizeAndClean(combinedText);

        if (candidateTokens.length === 0) {
            return { isDuplicate: false };
        }

        // 5: Existing challenges in the same district. DB errors propagate (the route reports them).
        const existingChallenges = await prisma.challenge.findMany({
            where: { district: { equals: district.trim(), mode: 'insensitive' } },
            select: { id: true, title: true, description: true, createdAt: true },
        });

        if (existingChallenges.length === 0) {
            return { isDuplicate: false };
        }

        // 6: Cosine similarity against each existing challenge
        const sims = tfidfSimilarities([
            candidateTokens,
            ...existingChallenges.map((ch) => this.tokenizeAndClean(`${ch.title} ${ch.description.slice(0, 150)}`)),
        ]);
        let best = 0;
        sims.forEach((v, i) => { if (v > sims[best]) best = i; });
        const maxSimilarity = sims[best] ?? 0;
        const mostSimilarChallenge = existingChallenges[best] ?? null;

        const SIMILARITY_THRESHOLD = 0.75;
        const isDuplicate = maxSimilarity > SIMILARITY_THRESHOLD;

        if (isDuplicate && mostSimilarChallenge) {
            const daysAgo = Math.max(
                1,
                Math.round(
                    (Date.now() - new Date(mostSimilarChallenge.createdAt).getTime()) /
                        (1000 * 60 * 60 * 24)
                )
            );

            return {
                isDuplicate: true,
                similarChallengeId: mostSimilarChallenge.id,
                similarityScore: Math.round(maxSimilarity * 100) / 100,
                similarChallengeTitle: mostSimilarChallenge.title,
                similarChallengeDaysAgo: daysAgo,
            };
        }

        return {
            isDuplicate: false,
            similarityScore: Math.round(maxSimilarity * 100) / 100,
            similarChallengeId: mostSimilarChallenge?.id,
            similarChallengeTitle: mostSimilarChallenge?.title,
        };
    }
}

export default DeduplicationService;
