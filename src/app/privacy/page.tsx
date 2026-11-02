import { appName } from "@/lib/mailer";

// Template privacy notice. Have it reviewed by a lawyer before launch.
export default function Privacy() {
  const n = appName();
  return (
    <div style={{ maxWidth: 760 }}>
      <h1>Privacy notice</h1>
      <p className="muted small">Template. The operator of this site must review it, fill in contact details and have it checked by a lawyer.</p>
      <h2>Who we are</h2>
      <p>{n} provides online registration for sports events. Each event organizer decides what information is collected for their event and is responsible for how they use it. {n} processes that information on their behalf.</p>
      <h2>What we collect and why</h2>
      <ul>
        <li><strong>Account details</strong> (name, email, password stored as a secure hash) to let you log in and manage registrations.</li>
        <li><strong>Registration details</strong> (name, email, phone, date of birth, gender, town, country, club, T-shirt size, answers to the organizer&apos;s questions) to run the event, assign age categories and publish results.</li>
        <li><strong>Emergency contact and medical notes</strong> to keep you safe on race day. These are encrypted and only visible to the event&apos;s managers.</li>
        <li><strong>Payment records</strong> (amounts, payment method, transaction reference). Card numbers are entered on the payment provider&apos;s page and never reach us.</li>
        <li><strong>Your waiver signature</strong> (typed name and time) as evidence that you accepted the event terms.</li>
      </ul>
      <h2>Marketing</h2>
      <p>We or the organizer only send promotional emails if you tick the opt-in box. You can opt out anytime from <a href="/account/data">Your data</a>.</p>
      <h2>Who we share it with</h2>
      <p>The event organizer and the staff they appoint, the payment provider you choose, our hosting and email providers, and timing companies where needed to produce results. Results (name, bib, time, category) are published on the event page.</p>
      <h2>Where it is stored</h2>
      <p>[Fill in: the country of your hosting provider, and the safeguards used for transfers outside Trinidad and Tobago.]</p>
      <h2>How long we keep it</h2>
      <p>Each organizer sets a retention period (one year after the event by default). After that, your personal details are removed from the registration and only anonymous counts are kept. Payment records are kept as long as accounting law requires, without your name.</p>
      <h2>Your rights</h2>
      <p>You can see, download, correct and delete your information. Use <a href="/account/data">Your data</a>, or contact us at [privacy@yourdomain]. If you are not satisfied, you may complain to the Office of the Information Commissioner of Trinidad and Tobago once it is operating, or the relevant regulator in your country.</p>
      <h2>Children</h2>
      <p>Participants under 18 must be registered with a parent or guardian&apos;s consent.</p>
      <h2>Security</h2>
      <p>Connections are encrypted (HTTPS), sensitive fields are encrypted in the database, staff access is role based, and access to participant data is logged.</p>
    </div>
  );
}
