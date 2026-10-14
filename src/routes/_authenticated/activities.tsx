import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Check, ListMusic, Music2, Pause, Play, Plus, RotateCcw, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type MusicPlaylist = { id: string; userId: string; name: string };
type MusicTrack = {
  id: string;
  userId: string;
  playlistId: string;
  title: string;
  audio: Blob;
};

function openMusicDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open("peace-companion-music", 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("playlists")) {
        database.createObjectStore("playlists", { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains("tracks")) {
        database.createObjectStore("tracks", { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Music library couldn't be opened."));
  });
}

async function readMusicLibrary(userId: string) {
  const database = await openMusicDatabase();
  return new Promise<{ playlists: MusicPlaylist[]; tracks: MusicTrack[] }>((resolve, reject) => {
    const transaction = database.transaction(["playlists", "tracks"], "readonly");
    const playlistsRequest = transaction.objectStore("playlists").getAll();
    const tracksRequest = transaction.objectStore("tracks").getAll();
    let playlists: MusicPlaylist[] = [];
    let tracks: MusicTrack[] = [];
    playlistsRequest.onsuccess = () => {
      playlists = (playlistsRequest.result as MusicPlaylist[]).filter((item) => item.userId === userId);
    };
    tracksRequest.onsuccess = () => {
      tracks = (tracksRequest.result as MusicTrack[]).filter((item) => item.userId === userId);
    };
    transaction.oncomplete = () => {
      database.close();
      resolve({ playlists, tracks });
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("Music library couldn't be loaded."));
    };
  });
}

async function saveMusicRecord(store: "playlists" | "tracks", record: MusicPlaylist | MusicTrack) {
  const database = await openMusicDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(store, "readwrite");
    transaction.objectStore(store).put(record);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("Your music couldn't be saved on this device."));
    };
  });
}

async function removeMusicTrack(id: string) {
  const database = await openMusicDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction("tracks", "readwrite");
    transaction.objectStore("tracks").delete(id);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("Track couldn't be removed."));
    };
  });
}

async function removeMusicPlaylist(playlistId: string) {
  const database = await openMusicDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(["playlists", "tracks"], "readwrite");
    transaction.objectStore("playlists").delete(playlistId);
    const tracksStore = transaction.objectStore("tracks");
    const request = tracksStore.getAll();
    request.onsuccess = () => {
      (request.result as MusicTrack[])
        .filter((track) => track.playlistId === playlistId)
        .forEach((track) => tracksStore.delete(track.id));
    };
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("Playlist couldn't be removed."));
    };
  });
}

export const Route = createFileRoute("/_authenticated/activities")({
  head: () => ({
    meta: [
      { title: "Calming activities — Peace Companion" },
      {
        name: "description",
        content:
          "A guided breathing timer, a grounding exercise, a mindful minute and a daily reflection question.",
      },
      { property: "og:title", content: "Calming activities — Peace Companion" },
      {
        property: "og:description",
        content: "Breathe, ground yourself, take a mindful minute or sit with a reflection question.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ActivitiesPage,
});

const GROUNDING_STEPS = [
  "Look around and name five things you can see.",
  "Notice four things you can physically feel right now.",
  "Listen for three sounds, near or far.",
  "Find two things you can smell, or two smells you like.",
  "Name one thing you can taste, or one thing you're grateful for.",
];

const REFLECTIONS = [
  "What felt kind today, even in a small way?",
  "What is one thing you can let go of tonight?",
  "Where in your body do you notice tension right now?",
  "Who would you like to reach out to this week?",
  "What would resting properly look like for you today?",
  "What did you handle better than you expected?",
  "What do you need more of, and what do you need less of?",
];

function useCompletion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ type, seconds }: { type: string; seconds?: number }) => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Please sign in again.");
      const { error } = await supabase.from("activity_completions").insert({
        user_id: auth.user.id,
        activity_type: type,
        duration_seconds: seconds ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Nicely done — that counts.");
      queryClient.invalidateQueries({ queryKey: ["activities"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["progress"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't save that."),
  });
}

const PHASES = [
  { label: "Inhale", seconds: 4 },
  { label: "Hold", seconds: 4 },
  { label: "Exhale", seconds: 6 },
  { label: "Pause", seconds: 2 },
] as const;

function BreathingExercise({ onComplete }: { onComplete: (seconds: number) => void }) {
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<number>(0);
  const [remaining, setRemaining] = useState<number>(PHASES[0].seconds);
  const [cycles, setCycles] = useState(0);
  const elapsed = useRef(0);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      elapsed.current += 1;
      setRemaining((value) => {
        if (value > 1) return value - 1;
        const next = (phase + 1) % PHASES.length;
        setPhase(next);
        if (next === 0) setCycles((c) => c + 1);
        return PHASES[next]!.seconds;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [running, phase]);

  const current = PHASES[phase]!;

  function reset() {
    setRunning(false);
    setPhase(0);
    setRemaining(PHASES[0].seconds);
    setCycles(0);
    elapsed.current = 0;
  }

  return (
    <div className="rounded-3xl border border-border/70 bg-card/70 p-6 text-center">
      <h2 className="text-lg">Breathing exercise</h2>
      <p className="mt-1 text-sm text-muted-foreground">Four in, hold, six out, small pause.</p>

      <div className="mt-6 flex justify-center">
        <div
          className={cn(
            "flex size-40 items-center justify-center rounded-full bg-secondary transition-transform duration-1000 ease-in-out",
            running && current.label === "Inhale" && "scale-110",
            running && current.label === "Exhale" && "scale-90",
          )}
        >
          <div>
            <p className="text-xl">{current.label}</p>
            <p className="mt-1 text-3xl text-primary">{remaining}</p>
          </div>
        </div>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">{cycles} full cycles</p>

      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Button className="rounded-full" onClick={() => setRunning((v) => !v)}>
          {running ? <Pause className="mr-1 size-4" /> : <Play className="mr-1 size-4" />}
          {running ? "Pause" : "Start"}
        </Button>
        <Button variant="outline" className="rounded-full" onClick={reset}>
          <RotateCcw className="mr-1 size-4" /> Reset
        </Button>
        <Button
          variant="ghost"
          className="rounded-full"
          disabled={cycles === 0}
          onClick={() => {
            onComplete(elapsed.current);
            reset();
          }}
        >
          <Check className="mr-1 size-4" /> Mark done
        </Button>
      </div>
    </div>
  );
}

function GroundingExercise({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const last = step === GROUNDING_STEPS.length - 1;

  return (
    <div className="rounded-3xl border border-border/70 bg-card/70 p-6">
      <h2 className="text-lg">Grounding exercise</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Step {step + 1} of {GROUNDING_STEPS.length}
      </p>
      <p className="mt-4 text-base">{GROUNDING_STEPS[step]}</p>
      <div className="mt-5 flex gap-2">
        <Button
          className="rounded-full"
          onClick={() => {
            if (last) {
              onComplete();
              setStep(0);
            } else setStep((s) => s + 1);
          }}
        >
          {last ? "Finish" : "Next"}
        </Button>
        {step > 0 && (
          <Button variant="ghost" className="rounded-full" onClick={() => setStep((s) => s - 1)}>
            Back
          </Button>
        )}
      </div>
    </div>
  );
}

function MindfulMinute({ onComplete }: { onComplete: () => void }) {
  const [left, setLeft] = useState(60);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      setLeft((value) => {
        if (value <= 1) {
          setRunning(false);
          onComplete();
          return 60;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [running, onComplete]);

  return (
    <div className="rounded-3xl border border-border/70 bg-card/70 p-6">
      <h2 className="text-lg">Mindful minute</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        One minute of just noticing. No goal, nothing to fix.
      </p>
      <p className="mt-4 text-4xl text-primary">
        0:{String(left).padStart(2, "0")}
      </p>
      <div className="mt-4 flex gap-2">
        <Button className="rounded-full" onClick={() => setRunning((v) => !v)}>
          {running ? "Pause" : "Start"}
        </Button>
        <Button
          variant="outline"
          className="rounded-full"
          onClick={() => {
            setRunning(false);
            setLeft(60);
          }}
        >
          Reset
        </Button>
      </div>
    </div>
  );
}

function DailyReflection({ onComplete }: { onComplete: () => void }) {
  const index = Math.floor(Date.now() / 864e5) % REFLECTIONS.length;
  return (
    <div className="rounded-3xl border border-border/70 bg-card/70 p-6">
      <h2 className="text-lg">Daily reflection</h2>
      <p className="mt-4 text-base">{REFLECTIONS[index]}</p>
      <Button className="mt-5 rounded-full" onClick={onComplete}>
        <Check className="mr-1 size-4" /> I sat with this
      </Button>
    </div>
  );
}

function ActivitiesPage() {
  const complete = useCompletion();

  const done = useQuery({
    queryKey: ["activities"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_completions")
        .select("activity_type, completed_at")
        .order("completed_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return data;
    },
  });

  const todayCount = (done.data ?? []).filter(
    (row) => new Date(row.completed_at).toDateString() === new Date().toDateString(),
  ).length;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="text-3xl">Calming activities</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {todayCount > 0
          ? `You've completed ${todayCount} activity${todayCount === 1 ? "" : "s"} today.`
          : "Pick whichever one sounds bearable right now."}
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <BreathingExercise
          onComplete={(seconds) => complete.mutate({ type: "breathing", seconds })}
        />
        <GroundingExercise onComplete={() => complete.mutate({ type: "grounding" })} />
        <MindfulMinute onComplete={() => complete.mutate({ type: "mindful_minute", seconds: 60 })} />
        <DailyReflection onComplete={() => complete.mutate({ type: "daily_reflection" })} />
      </div>
    </div>
  );
}
