import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = process.env.RESEND_FROM_EMAIL ?? "results@joingridlock.com";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://joingridlock.com";

export interface RaceResultEmailParams {
  to: string;
  raceName: string;
  raceId: string;
  totalScore: number;
  correctPicks: number;
  totalQuestions: number;
}

export async function sendRaceResultEmail(params: RaceResultEmailParams): Promise<void> {
  if (!resend) return;

  const { to, raceName, raceId, totalScore, correctPicks, totalQuestions } = params;

  await resend.emails.send({
    from: FROM,
    to,
    subject: `Your ${raceName} results are in — ${totalScore.toFixed(1)} pts`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 16px;background:#000;color:#fff;">
        <p style="color:#E10600;font-weight:700;font-size:0.85rem;letter-spacing:0.1em;margin:0 0 8px;">GRIDLOCK</p>
        <h1 style="font-size:1.5rem;margin:0 0 16px;">${raceName} Results</h1>
        <p style="font-size:2.5rem;font-weight:700;margin:0 0 4px;">${totalScore.toFixed(1)} pts</p>
        <p style="color:rgba(255,255,255,0.5);margin:0 0 24px;">${correctPicks} of ${totalQuestions} correct</p>
        <a href="${APP_URL}/scores/${raceId}" style="display:inline-block;background:#E10600;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:700;">
          View full breakdown →
        </a>
        <p style="margin-top:32px;color:rgba(255,255,255,0.3);font-size:0.8rem;">
          You're receiving this because you made predictions on Gridlock.
        </p>
      </div>
    `,
  });
}
