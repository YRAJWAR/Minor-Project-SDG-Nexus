import { requireUser } from '@/server/middleware/auth';
import { NextRequest, NextResponse } from 'next/server';
import { classifyProjectSDGs } from '@/services/sdgClassifierService';
import { handleApiError, AppError } from '@/server/middleware/errorHandler';
import { successResponse, sanitizeString } from '@/server/utils';

// ──────────────────────────────────────────────────────────────
// POST /api/classify-sdg — AI SDG Classification
// ──────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
    const user = await requireUser(request);
    if (user instanceof NextResponse) return user;
    try {
        const { description } = await request.json();

        if (!description || typeof description !== 'string' || description.trim().length < 10) {
            throw AppError.badRequest('Validation failed', ['description: Required, minimum 10 characters']);
        }

        const sanitized = sanitizeString(description);
        const result = await classifyProjectSDGs(sanitized);

        return NextResponse.json(successResponse(result));
    } catch (error) {
        return handleApiError(error);
    }
}
