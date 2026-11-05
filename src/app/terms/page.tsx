import { appName } from "@/lib/mailer";
export default function Terms() {
  const app = appName();
  return (
    <div style={{ maxWidth: 760 }}>
      <h1>Terms of use</h1>
      <p className="muted small">Template. Replace with terms reviewed by a lawyer.</p>

      <h2>For participants</h2>
      <p>{app} is a platform that lets organizers sell entries to their events. The contract for taking part in an event is between you and the organizer, including its waiver and refund policy. Platform fees are shown before you pay.</p>

      <h2 id="organizers">For organizers</h2>
      <p>By creating an event on {app} you agree to the following.</p>
      <ol>
        <li><strong>Where your event appears.</strong> While an event is published, {app} may show its name, date, location, map pin, races, prices, description and images on the event page, in search results, in &ldquo;Near me&rdquo; results, in featured or promotional placements, on results pages, and in emails to participants. Drafts are not shown. You can unpublish or close an event at any time.</li>
        <li><strong>Your content.</strong> You confirm that you own, or have permission to use, the text, logos and photos you upload, and that event details are accurate. You give {app} a non-exclusive, royalty-free licence to display that content for as long as the event is listed. You are responsible for keeping details such as dates, prices and policies up to date.</li>
        <li><strong>Your event.</strong> You run the event and are responsible for it, including permits, safety, insurance, the waiver, the refund policy, and any fees you collect for other organizations.</li>
        <li><strong>Participant data.</strong> You decide what participant information to collect and use it only to run your event and as participants have agreed. {app} processes that data for you as set out in the <a href="/privacy">privacy policy</a>. Keep exports secure, and don&apos;t share them beyond the people who need them.</li>
        <li><strong>Fees and payments.</strong> Platform fees and any payment processing fees are shown when you set up your event. Featured placement is optional and billed separately once approved.</li>
        <li><strong>Removal.</strong> {app} may hide or remove an event that is misleading, infringes someone&apos;s rights, or breaks the law or these terms, and will tell you why.</li>
      </ol>
    </div>
  );
}
