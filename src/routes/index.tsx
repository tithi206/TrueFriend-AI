import { createFileRoute, Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Peace Companion — A calm place to talk it through" },
      {
        name: "description",
        content:
          "An empathetic AI companion for anxious moments and personal growth. Threaded conversations, mood check-ins, and a private journal in one calm space.",
      },
      { property: "og:title", content: "Peace Companion — A calm place to talk it through" },
      {
        property: "og:description",
        content:
          "Talk through anxious thoughts, track your mood, and keep private journal notes with an empathetic AI companion.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  {
    title: "Conversations that continue",
    body: "Every talk is saved as its own thread, so you can pick up a thought days later instead of starting over.",
  },
  {
    title: "Mood check-ins",
    body: "A five-second check-in captures how you're feeling and gives your companion useful context.",
  },
  {
    title: "A private journal",
    body: "Write freely alongside each check-in. Only you can read your notes.",
  },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5">
        <span className="font-serif text-lg">Peace Companion</span>
        <Button asChild variant="ghost" size="sm" className="rounded-full">
          <Link to="/auth">Sign in</Link>
        </Button>
      </header>

      <section className="mx-auto w-full max-w-3xl px-5 pb-16 pt-14 text-center">
        <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Breathe first</p>
        <h1 className="mt-5 text-balance text-4xl leading-tight sm:text-5xl">
          A calm place to talk it through
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-pretty text-base text-muted-foreground">
          Peace Companion listens without judgement, helps you untangle anxious thoughts, and
          remembers where you left off — so growth feels like a conversation, not a chore.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg" className="rounded-full px-7">
            <Link to="/auth" search={{ mode: "signup" }}>
              Start talking
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="rounded-full px-7">
            <Link to="/auth">I have an account</Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-5xl gap-4 px-5 pb-20 sm:grid-cols-3">
        {FEATURES.map((feature) => (
          <article key={feature.title} className="rounded-3xl border border-border/70 bg-card/70 p-6">
            <h2 className="text-lg">{feature.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.body}</p>
          </article>
        ))}
      </section>

      <footer className="border-t border-border/70 py-8 text-center text-xs text-muted-foreground">
        Peace Companion offers support, not medical advice. In a crisis, contact local emergency
        services or a crisis line such as 988 (US).
      </footer>
    </div>
  );
}
