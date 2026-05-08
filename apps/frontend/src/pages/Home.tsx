import type { Route } from '../App';

export default function Home(props: { onNavigate: (r: Route) => void }) {
  return (
    <div className="max-w-5xl mx-auto px-6">
      <section className="pt-20 pb-16">
        <div className="max-w-3xl">
          <span className="pill mb-6">private by design</span>
          <h1 className="font-display text-5xl sm:text-6xl leading-[1.05] font-semibold mb-6">
            Score gift ideas without
            <br />
            <span className="italic text-rust">spoiling the surprise.</span>
          </h1>
          <p className="text-lg text-ink/70 max-w-2xl leading-relaxed">
            Build a private taste profile — the things you own, want, like, dislike.
            Share a single code with friends. They can pitch a gift idea and get a
            score from 1 to 10, but they never see what's in your profile.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <button
              onClick={() => props.onNavigate('build')}
              className="btn-primary px-6 py-3 text-base"
            >
              Create gift profile →
            </button>
            <button
              onClick={() => props.onNavigate('score')}
              className="btn-secondary px-6 py-3 text-base"
            >
              Score a gift idea
            </button>
          </div>
        </div>
      </section>

      <section className="grid sm:grid-cols-3 gap-4 pb-16">
        <Step
          n="01"
          title="Recipient builds a profile"
          body="Add what you own, want, like, dislike, your hobbies, style, and a budget range. Stays private."
        />
        <Step
          n="02"
          title="Share a code"
          body="Hand out a single GIFT-XXXXXX code. Givers only see the occasion and budget, never your profile."
        />
        <Step
          n="03"
          title="Givers get a score"
          body="A 1–10 score with pros, cons, confidence, and budget fit — generated against your profile in private."
        />
      </section>
    </div>
  );
}

function Step(props: { n: string; title: string; body: string }) {
  return (
    <div className="card p-6">
      <div className="font-mono text-xs text-rust mb-3">{props.n}</div>
      <h3 className="text-lg font-semibold mb-2">{props.title}</h3>
      <p className="text-sm text-ink/70 leading-relaxed">{props.body}</p>
    </div>
  );
}
