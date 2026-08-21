"use client";

// The self-serve pack builder. Everything stateful goes through the
// SECURITY DEFINER RPCs (create/save/publish_venue_pack) — this component is
// just a friendly editor over them. RLS lets the venue read its own drafts.
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface EditorQuestion {
  prompt: string;
  format: "multiple_choice" | "true_false";
  options: string[]; // 4 slots in the editor; blanks trimmed on save
  answerIndex: number; // multiple_choice
  answerBool: boolean; // true_false
  time: number;
}

const BLANK: EditorQuestion = {
  prompt: "",
  format: "multiple_choice",
  options: ["", "", "", ""],
  answerIndex: 0,
  answerBool: true,
  time: 25,
};

export function PackBuilder({ packId }: { packId: string | null }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [status, setStatus] = useState<string>("new");
  const [questions, setQuestions] = useState<EditorQuestion[]>([{ ...BLANK }]);
  const [hasFinal, setHasFinal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(!packId);

  // Load an existing draft (or show a live pack read-only).
  useEffect(() => {
    if (!packId) return;
    const supabase = createClient();
    void (async () => {
      const [{ data: pack }, { data: rows }] = await Promise.all([
        supabase.from("packs").select("title, topic, status, rounds").eq("id", packId).maybeSingle(),
        supabase
          .from("pack_questions")
          .select("round, position, format, prompt, options, answer, time_limit_s")
          .eq("pack_id", packId)
          .order("round")
          .order("position"),
      ]);
      if (!pack) {
        setError("That pack isn't yours or doesn't exist.");
        setLoaded(true);
        return;
      }
      setTitle(pack.title);
      setTopic(pack.topic);
      setStatus(pack.status);
      const qs: EditorQuestion[] = (rows ?? []).map((r) => ({
        prompt: r.prompt as string,
        format: (r.format === "true_false" ? "true_false" : "multiple_choice") as EditorQuestion["format"],
        options: [
          ...(((r.options as string[] | null) ?? []).slice(0, 4)),
          ...Array(Math.max(0, 4 - (((r.options as string[] | null) ?? []).length))).fill(""),
        ],
        answerIndex: typeof r.answer === "number" ? (r.answer as number) : 0,
        answerBool: r.answer === true,
        time: (r.time_limit_s as number) ?? 25,
      }));
      if (qs.length > 0) setQuestions(qs);
      setHasFinal((rows ?? []).some((r) => (r.round as number) > (pack.rounds as number)));
      setLoaded(true);
    })();
  }, [packId]);

  const patch = (i: number, part: Partial<EditorQuestion>) =>
    setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...part } : q)));

  const payload = useCallback(() => {
    return questions.map((q) => {
      if (q.format === "true_false") {
        return { prompt: q.prompt.trim(), format: q.format, answer: q.answerBool, time_limit_s: q.time };
      }
      const kept = q.options.map((o) => o.trim()).filter(Boolean);
      // Keep the answer pointing at the same option after blanks are trimmed.
      const answerText = q.options[q.answerIndex]?.trim() ?? "";
      const answer = Math.max(0, kept.indexOf(answerText));
      return { prompt: q.prompt.trim(), format: q.format, options: kept, answer, time_limit_s: q.time };
    });
  }, [questions]);

  const persist = useCallback(
    async (thenPublish: boolean) => {
      setBusy(true);
      setError(null);
      const supabase = createClient();
      try {
        let id = packId;
        if (!id) {
          const { data, error: cErr } = await supabase.rpc("create_venue_pack", {
            p_title: title || "House pack",
            p_topic: topic || "house",
          });
          if (cErr) throw cErr;
          id = data as string;
        }
        const { error: sErr } = await supabase.rpc("save_venue_pack", {
          p_pack_id: id,
          p_title: title,
          p_topic: topic,
          p_questions: payload(),
          p_has_final: hasFinal,
        });
        if (sErr) throw sErr;
        if (thenPublish) {
          const { error: pErr } = await supabase.rpc("publish_venue_pack", { p_pack_id: id });
          if (pErr) throw pErr;
          router.push("/dashboard?published=1");
          return;
        }
        setSavedAt(new Date().toLocaleTimeString());
        if (!packId) router.replace(`/dashboard/create?pack=${id}`);
      } catch (e) {
        const msg =
          (e as { message?: string })?.message ??
          (typeof e === "string" ? e : "could not save");
        setError(msg);
      } finally {
        setBusy(false);
      }
    },
    [packId, title, topic, payload, hasFinal, router],
  );

  if (!loaded) return <p className="text-sm text-zinc-400">Loading your pack…</p>;

  if (status === "live" || status === "retired") {
    return (
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6" data-testid="pack-live-view">
        <p className="text-lg font-semibold text-zinc-100">
          “{title}” is {status === "live" ? "live" : "retired"}.
        </p>
        <p className="mt-1 text-sm text-zinc-400">
          {status === "live"
            ? "It's in your pack library, ready to start tonight. Published packs can't be edited — retire it from the dashboard if it's done."
            : "Retired packs stay in your history but can't start new games."}
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-6" data-testid="pack-builder">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm text-zinc-300">
          Pack name
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
            placeholder="Regulars' Night Vol. 1"
            data-testid="pack-title"
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-zinc-50"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-zinc-300">
          Topic (shows on the card)
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            maxLength={60}
            placeholder="This bar, this block, this city"
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-zinc-50"
          />
        </label>
      </div>

      <ol className="flex flex-col gap-4">
        {questions.map((q, i) => {
          const isFinalSlot = hasFinal && i === questions.length - 1;
          return (
            <li
              key={i}
              data-testid="builder-question"
              className={`flex flex-col gap-3 rounded-2xl border p-5 ${
                isFinalSlot ? "border-amber-700 bg-amber-950/20" : "border-zinc-800 bg-zinc-900"
              }`}
            >
              <div className="flex items-center justify-between text-xs uppercase tracking-wider text-zinc-400">
                <span>
                  {isFinalSlot ? "Final wager question" : `Question ${i + 1}`}
                </span>
                <span className="flex items-center gap-3">
                  <select
                    value={q.format}
                    onChange={(e) => patch(i, { format: e.target.value as EditorQuestion["format"] })}
                    className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-zinc-300"
                  >
                    <option value="multiple_choice">multiple choice</option>
                    <option value="true_false">true / false</option>
                  </select>
                  <select
                    value={q.time}
                    onChange={(e) => patch(i, { time: Number(e.target.value) })}
                    className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-zinc-300"
                  >
                    <option value={15}>15s</option>
                    <option value={25}>25s</option>
                    <option value={40}>40s</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => setQuestions((qs) => qs.filter((_, j) => j !== i))}
                    disabled={questions.length === 1}
                    className="text-zinc-500 hover:text-red-400 disabled:opacity-30"
                    aria-label={`remove question ${i + 1}`}
                  >
                    remove
                  </button>
                </span>
              </div>

              <textarea
                value={q.prompt}
                onChange={(e) => patch(i, { prompt: e.target.value })}
                rows={2}
                maxLength={300}
                placeholder="Ask it exactly how you'd say it out loud."
                data-testid={`q-prompt-${i}`}
                className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-base text-zinc-50"
              />

              {q.format === "multiple_choice" ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {q.options.map((opt, oi) => (
                    <label key={oi} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`answer-${i}`}
                        checked={q.answerIndex === oi}
                        onChange={() => patch(i, { answerIndex: oi })}
                        className="h-4 w-4 accent-amber-400"
                        aria-label={`option ${oi + 1} is correct`}
                      />
                      <input
                        value={opt}
                        onChange={(e) =>
                          patch(i, { options: q.options.map((o, j) => (j === oi ? e.target.value : o)) })
                        }
                        maxLength={120}
                        placeholder={oi < 2 ? `Option ${oi + 1} (required)` : `Option ${oi + 1}`}
                        data-testid={`q-${i}-option-${oi}`}
                        className={`w-full rounded-lg border bg-zinc-950 px-3 py-2 text-sm text-zinc-50 ${
                          q.answerIndex === oi ? "border-amber-500" : "border-zinc-700"
                        }`}
                      />
                    </label>
                  ))}
                  <p className="text-xs text-zinc-500 sm:col-span-2">the dot marks the right answer</p>
                </div>
              ) : (
                <div className="flex gap-2">
                  {[true, false].map((v) => (
                    <button
                      key={String(v)}
                      type="button"
                      onClick={() => patch(i, { answerBool: v })}
                      className={`rounded-lg border px-4 py-2 text-sm font-semibold ${
                        q.answerBool === v
                          ? "border-amber-500 bg-amber-400 text-zinc-950"
                          : "border-zinc-700 text-zinc-300"
                      }`}
                    >
                      {v ? "True" : "False"} {q.answerBool === v ? "✓" : ""}
                    </button>
                  ))}
                  <span className="self-center text-xs text-zinc-500">tap the correct one</span>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          data-testid="add-question"
          onClick={() => setQuestions((qs) => [...qs, { ...BLANK }])}
          className="rounded-xl border border-dashed border-zinc-600 px-5 py-2.5 text-zinc-300 hover:border-amber-400 hover:text-amber-300 active:scale-[0.98]"
        >
          + Add question
        </button>
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={hasFinal}
            onChange={(e) => setHasFinal(e.target.checked)}
            className="h-4 w-4 accent-amber-400"
          />
          Make the last question a final wager
        </label>
      </div>

      {error && (
        <p role="alert" data-testid="builder-error" className="rounded-lg border border-red-900 bg-red-950 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3 border-t border-zinc-800 pt-5">
        <button
          type="button"
          data-testid="save-draft"
          onClick={() => void persist(false)}
          disabled={busy}
          className="rounded-xl border border-zinc-700 px-6 py-3 font-semibold text-zinc-200 hover:border-amber-400 active:scale-[0.98] disabled:opacity-50"
        >
          {busy ? "Working…" : "Save draft"}
        </button>
        <button
          type="button"
          data-testid="publish-pack"
          onClick={() => void persist(true)}
          disabled={busy || questions.length < 5}
          className="rounded-xl bg-amber-400 px-6 py-3 font-bold text-zinc-950 hover:bg-amber-300 active:scale-[0.98] disabled:opacity-50"
        >
          Publish to my library
        </button>
        <span className="text-xs text-zinc-500">
          {questions.length < 5
            ? `${5 - questions.length} more question${5 - questions.length === 1 ? "" : "s"} to publish`
            : savedAt
              ? `saved ${savedAt}`
              : `${questions.length} questions`}
        </span>
      </div>
    </section>
  );
}
