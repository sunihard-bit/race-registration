import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { currentTier, eventBySlug, questionsFor, racesFor, relayLegs } from "@/lib/events";
import { money } from "@/lib/format";
import RegisterForm from "./RegisterForm";
import { getProfile } from "@/lib/profile";

export default async function Register({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ race?: string; invite?: string }> }) {
  const { slug } = await params;
  const { race: raceId, invite } = await searchParams;
  const e = eventBySlug(slug);
  if (!e || e.status !== "published") notFound();
  const user = await requireUser(`/events/${slug}/register?race=${raceId ?? ""}${invite ? `&invite=${invite}` : ""}`);
  const race = racesFor(e.id).find((r) => r.id === raceId);
  if (!race) notFound();
  const tier = currentTier(race.id);
  const questions = questionsFor(e.id).map((q) => ({ id: q.id, label: q.label, kind: q.kind, required: !!q.required, options: JSON.parse(q.options || "[]") as string[] }));
  return (
    <div style={{ maxWidth: 760 }}>
      <p className="small"><Link href={`/events/${e.slug}`}>← {e.name}</Link></p>
      <h1>Register: {race.name}</h1>
      {tier && <p className="muted">{tier.name} price {money(tier.price_cents, e.currency)}. Fees are shown before you pay.</p>}
      <RegisterForm
        eventId={e.id} raceId={race.id} raceKind={race.kind} legs={relayLegs(race)} waiver={e.waiver_text}
        fundraising={!!e.fundraising_enabled} cause={e.fundraising_cause} questions={questions}
        defaults={{ name: user.name, email: user.email }} inviteCode={invite} profile={getProfile(user.id)}
      />
    </div>
  );
}
