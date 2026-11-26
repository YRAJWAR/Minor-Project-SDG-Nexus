import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireUser } from '@/server/middleware/auth';
import { classifyProjectSDGs } from '@/services/sdgClassifierService';
import { NotificationTriggers } from '@/lib/notifications';

export async function POST(req: NextRequest) {
    try {
        const user = await requireUser(req, ['CITIZEN', 'NGO', 'ADMIN']);
        if (user instanceof NextResponse) return user;

        const body = await req.json();
        const {
            title,
            description,
            category,
            state,
            district,
            block,
            village,
            gpsLat,
            gpsLng,
            photoUrls,
            videoUrls,
            isAnonymous,
            isGpNode,
            vleOperatorCode,
            submittedVia,
            isDuplicate,
            similarChallengeId,
        } = body;

        // Validation
        if (!title || typeof title !== 'string' || title.trim().length < 3 || title.trim().length > 150) {
            return NextResponse.json(
                { success: false, error: 'Title must be 3–150 characters', timestamp: new Date().toISOString() },
                { status: 400 }
            );
        }

        if (!description || typeof description !== 'string' || description.trim().length < 10 || description.trim().length > 3000) {
            return NextResponse.json(
                { success: false, error: 'Description must be 10–3000 characters', timestamp: new Date().toISOString() },
                { status: 400 }
            );
        }

        if (typeof state !== 'string' || typeof district !== 'string' || !state || !district) {
            return NextResponse.json(
                { success: false, error: 'State and district are required', timestamp: new Date().toISOString() },
                { status: 400 }
            );
        }
        // The district must really belong to the chosen state (both come from the regions table).
        const knownDistrict = await prisma.district.findFirst({ where: { name: district, state: { name: state } }, select: { id: true } });
        if (!knownDistrict) {
            return NextResponse.json(
                { success: false, error: 'Please choose a district from the list for the selected state.', timestamp: new Date().toISOString() },
                { status: 400 }
            );
        }

        if (!category || typeof category !== 'string') {
            return NextResponse.json(
                { success: false, error: 'Category is required', timestamp: new Date().toISOString() },
                { status: 400 }
            );
        }

        if (Array.isArray(photoUrls) && photoUrls.length > 5) {
            return NextResponse.json(
                { success: false, error: 'A maximum of 5 photos can be attached', timestamp: new Date().toISOString() },
                { status: 400 }
            );
        }

        // Submitter attribution comes from the signed-in account; anonymous reports hide the name publicly.
        const anonymousFlag = Boolean(isAnonymous);
        const submittedByStr = anonymousFlag ? 'Anonymous Citizen' : user.full_name;

        // Run SDG Classification (Title + Description)
        let sdgTags: number[] = [];
        let aiConfidence = 0.85;
        let reasoning = 'Classified automatically by SDG Nexus AI engine.';

        try {
            const classification = await classifyProjectSDGs(`${title.trim()}. ${description.trim()}`);
            if (classification && Array.isArray(classification.sdg_tags) && classification.sdg_tags.length > 0) {
                sdgTags = classification.sdg_tags;
                if (classification.classifications?.[0]?.confidence) {
                    aiConfidence = classification.classifications[0].confidence;
                }
                if (classification.reasoning) {
                    reasoning = classification.reasoning;
                }
            }
        } catch (clfErr) {
            console.warn('SDG auto-classification error, falling back to defaults:', clfErr);
            sdgTags = [11, 1]; // Default fallback: Sustainable Cities, No Poverty
        }

        // Prepare combined text if village or merge specified
        let finalDescription = village && village.trim()
            ? `[Village / Ward: ${village.trim()}] ${description.trim()}`
            : description.trim();

        if (isDuplicate && similarChallengeId) {
            finalDescription = `[MERGED WITH TICKET #${similarChallengeId}] ${finalDescription}`;
        }

        // GPS is optional: no fix means no coordinates, never a made-up point.
        const okLat = typeof gpsLat === 'number' && Math.abs(gpsLat) <= 90;
        const okLng = typeof gpsLng === 'number' && Math.abs(gpsLng) <= 180;
        const latitude = okLat && okLng ? gpsLat : null;
        const longitude = okLat && okLng ? gpsLng : null;

        // Persist Challenge
        let challenge;
        try {
            challenge = await prisma.challenge.create({
                data: {
                    title: title.trim(),
                    description: finalDescription,
                    state,
                    district,
                    block: block ? block.trim() : null,
                    gpsLat: latitude,
                    gpsLng: longitude,
                    category: category.trim(),
                    photoUrls: Array.isArray(photoUrls) ? photoUrls : [],
                    videoUrls: Array.isArray(videoUrls) ? videoUrls : [],
                    status: 'AI_PROCESSED',
                    sdgTags,
                    aiConfidence,
                    submittedBy: submittedByStr,
                    submitterType: user.role,
                    isAnonymous: anonymousFlag,
                    isDuplicate: Boolean(isDuplicate),
                    duplicateOf: similarChallengeId ? String(similarChallengeId) : null,
                    submittedVia: (isGpNode || submittedVia === 'GRAM_PANCHAYAT_NODE') ? 'GRAM_PANCHAYAT_NODE' : 'PORTAL',
                },
            });
        } catch (dbErr) {
            console.error('Database write failed in challenge submission:', dbErr);
            return NextResponse.json(
                { success: false, error: 'Your report could not be saved right now. Please try again in a few minutes.', timestamp: new Date().toISOString() },
                { status: 503 }
            );
        }

        // Trigger 1: P2 Notification for all GOV users
        try {
            await NotificationTriggers.challengeSubmitted({
                id: challenge.id,
                title: title.trim(),
                district,
            });
        } catch (notifErr) {
            console.warn('Failed to send government notification for challenge:', notifErr);
        }

        return NextResponse.json(
            {
                success: true,
                data: {
                    challengeId: challenge.id,
                    status: challenge.status,
                    sdgTags: challenge.sdgTags,
                    aiConfidence: challenge.aiConfidence,
                    category: challenge.category,
                    district: challenge.district,
                    submittedBy: anonymousFlag ? 'Anonymous Citizen' : submittedByStr,
                    reasoning,
                },
                timestamp: new Date().toISOString(),
            },
            { status: 201 }
        );
    } catch (error: any) {
        console.error('Citizen challenge submission failed:', error);
        return NextResponse.json(
            {
                success: false,
                error: error.message || 'Internal server error while processing challenge submission',
                timestamp: new Date().toISOString(),
            },
            { status: 500 }
        );
    }
}
