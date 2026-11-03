import { appName } from "@/lib/mailer";
export default function Terms() {
  return (
    <div style={{ maxWidth: 760 }}>
      <h1>Terms of use</h1>
      <p className="muted small">Template. Replace with terms reviewed by a lawyer.</p>
      <p>{appName()} is a platform that lets organizers sell entries to their events. The contract for taking part in an event is between you and the organizer, including its waiver and refund policy. Platform fees are shown before you pay.</p>
    </div>
  );
}
