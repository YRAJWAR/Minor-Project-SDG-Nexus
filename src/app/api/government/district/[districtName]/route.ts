import { requireUser } from '@/server/middleware/auth';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getDistrictProfile } from '@/data/jharkhandDistricts';

export async function GET(
    req: NextRequest,
    context: { params: Promise<{ districtName: string }> }
) {
    const user = await requireUser(req, ['OFFICER', 'ADMIN']);
    if (user instanceof NextResponse) return user;
    try {
        const { districtName } = await context.params;
        const decodedDistrict = decodeURIComponent(districtName || '').trim();

        if (!decodedDistrict) {
            return NextResponse.json(
                { success: false, error: 'District name is required', timestamp: new Date().toISOString() },
                { status: 400 }
            );
        }

        const profile = getDistrictProfile(decodedDistrict);
        const now = new Date();

        let dbChallenges: any[] = [];
        try {
            dbChallenges = await prisma.challenge.findMany({
                where: {
                    district: {
                        equals: decodedDistrict,
                        mode: 'insensitive',
                    },
                },
                include: {
                    proposals: {
                        select: {
                            id: true,
                            budgetRequested: true,
                            status: true,
                            hei: {
                                select: {
                                    name: true,
                                    district: true,
                                },
                            },
                        },
                    },
                },
                orderBy: { createdAt: 'desc' },
            });
        } catch (dbErr) {
            console.error(`Prisma error fetching challenges for district ${decodedDistrict}:`, dbErr);
            return NextResponse.json(
                { success: false, error: 'District data is temporarily unavailable.', timestamp: new Date().toISOString() },
                { status: 503 }
            );
        }

        let totalChallenges = 0;
        let resolvedChallenges = 0;
        let activeEngagements = 0;
        let csrFundingCommitted = 0;
        const pendingList: { id: string; title: string; status: string; daysPending: number; category: string; sdgs: number[] }[] = [];

        if (dbChallenges && dbChallenges.length > 0) {
            totalChallenges = dbChallenges.length;

            dbChallenges.forEach((ch) => {
                const isResolved = ch.status === 'COMPLETED' || ch.status === 'DEPLOYED';
                const isActiveEng =
                    ch.status === 'IN_PROGRESS' ||
                    ch.status === 'TEAM_FORMED' ||
                    (ch.status === 'UNIVERSITY_ASSIGNED' && ch.proposals?.length > 0);

                if (isResolved) {
                    resolvedChallenges += 1;
                }
                if (isActiveEng) {
                    activeEngagements += 1;
                }

                // Sum accepted proposal budgets for CSR funding
                if (ch.proposals && ch.proposals.length > 0) {
                    ch.proposals.forEach((p: any) => {
                        if (p.status === 'ACCEPTED' || p.status === 'MILESTONE_IN_PROGRESS') {
                            csrFundingCommitted += Number(p.budgetRequested || 0);
                        }
                    });
                }

                // Collect pending challenges
                if (!isResolved) {
                    const refDate = ch.updatedAt || ch.createdAt;
                    const daysPending = Math.max(
                        0,
                        Math.floor((now.getTime() - new Date(refDate).getTime()) / (1000 * 60 * 60 * 24))
                    );
                    pendingList.push({
                        id: ch.id,
                        title: ch.title,
                        status: ch.status,
                        daysPending,
                        category: ch.category,
                        sdgs: ch.sdgTags,
                    });
                }
            });
        }

        // Sort pending by daysPending descending and take top 3
        pendingList.sort((a, b) => b.daysPending - a.daysPending);
        const top3Pending = pendingList.slice(0, 3);

        // Resolution rate
        const resolutionRate =
            totalChallenges > 0 ? Math.round((resolvedChallenges / totalChallenges) * 100) : 0;

        const pendingChallengesCount = Math.max(0, totalChallenges - resolvedChallenges);

        // Recommendation line logic as specified
        let recommendation = '';
        if (totalChallenges === 0) {
            recommendation = 'No challenges have been reported in this district yet.';
        } else if (resolutionRate < 40) {
            recommendation = `⚠ Recommended: Route ${pendingChallengesCount} pending challenges to ${profile.nearestHei}`;
        } else if (resolutionRate <= 70) {
            recommendation = `📊 Moderate engagement — ${pendingChallengesCount} challenges need university routing`;
        } else {
            recommendation = `✅ Well-served district — prioritize outreach to neighbouring areas`;
        }

        return NextResponse.json({
            success: true,
            data: {
                district: profile.name,
                headquarters: profile.headquarters,
                division: profile.division,
                nitiSdgIndex: profile.nitiSdgIndex,
                nearestHei: profile.nearestHei,
                heiDistrict: profile.heiDistrict,
                sdgPressures: profile.sdgPressures,
                stats: {
                    totalChallenges,
                    resolvedChallenges,
                    resolutionRate,
                    activeUniversityEngagements: activeEngagements,
                    csrFundingCommitted,
                    csrFundingCommittedFormatted: `₹${(csrFundingCommitted / 100000).toFixed(1)} Lakh`,
                },
                pendingChallenges: top3Pending,
                recommendation,
            },
            timestamp: new Date().toISOString(),
        });
    } catch (error: any) {
        console.error('Failed to fetch district drill-down data:', error);
        return NextResponse.json(
            {
                success: false,
                error: error.message || 'Failed to fetch district drill-down data',
                timestamp: new Date().toISOString(),
            },
            { status: 500 }
        );
    }
}
