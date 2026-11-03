import { requireEventRole } from "@/lib/auth";
import { questionsFor } from "@/lib/events";
import { addQuestion, deleteQuestion } from "../actions";

export default async function Questions({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireEventRole(id, "manager");
  const qs = questionsFor(id);
  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <p className="muted small">Every form already asks for name, email, phone, date of birth, gender, town, country, club, T-shirt size, emergency contact and medical notes. Add your own questions here. Only ask for what you need to run the event.</p>
      <div className="card"><table><thead><tr><th>Question</th><th>Type</th><th>Required</th><th></th></tr></thead><tbody>
        {qs.map((q) => (
          <tr key={q.id}><td>{q.label}{q.kind === "select" && <div className="small muted">{JSON.parse(q.options).join(", ")}</div>}</td><td>{q.kind}</td><td>{q.required ? "Yes" : "No"}</td>
            <td><form action={deleteQuestion}><input type="hidden" name="event_id" value={id} /><input type="hidden" name="question_id" value={q.id} /><button className="small secondary">Remove</button></form></td></tr>
        ))}
        {qs.length === 0 && <tr><td colSpan={4} className="muted">No custom questions.</td></tr>}
      </tbody></table></div>
      <form action={addQuestion} className="card">
        <input type="hidden" name="event_id" value={id} />
        <h3>Add a question</h3>
        <div className="cols">
          <div className="field"><label>Question</label><input name="label" required placeholder="Estimated finish time" /></div>
          <div className="field"><label>Type</label><select name="kind"><option value="text">Short answer</option><option value="select">Dropdown</option><option value="checkbox">Tick box</option></select></div>
        </div>
        <div className="field"><label>Dropdown options, comma separated</label><input name="options" placeholder="Under 45 min, 45–60 min, Over 60 min" /></div>
        <label className="check"><input type="checkbox" name="required" /> Required</label>
        <p><button>Add question</button></p>
      </form>
    </div>
  );
}
