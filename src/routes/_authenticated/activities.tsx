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

function MusicLibrary() {
  const { user } = useAuth();
  const [playlists, setPlaylists] = useState<MusicPlaylist[]>([]);
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState("");
  const [playlistName, setPlaylistName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentTrackId, setCurrentTrackId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPlaylists([]);
    setTracks([]);
    setSelectedPlaylistId("");
    setCurrentTrackId(null);
    setPlaying(false);
    if (!user?.id) {
      setLoading(false);
      return;
    }
    readMusicLibrary(user.id)
      .then((library) => {
        if (cancelled) return;
        setPlaylists(library.playlists.sort((a, b) => a.name.localeCompare(b.name)));
        setTracks(library.tracks);
        setSelectedPlaylistId(library.playlists[0]?.id ?? "");
      })
      .catch(() => {
        if (!cancelled) toast.error("Your music library couldn't be loaded on this device.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => () => {
    audioRef.current?.pause();
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  const selectedPlaylist = playlists.find((playlist) => playlist.id === selectedPlaylistId);
  const playlistTracks = tracks.filter((track) => track.playlistId === selectedPlaylistId);

  async function createPlaylist() {
    const name = playlistName.trim();
    if (!name || !user?.id) return;
    const playlist: MusicPlaylist = { id: crypto.randomUUID(), userId: user.id, name: name.slice(0, 60) };
    try {
      await saveMusicRecord("playlists", playlist);
      setPlaylists((current) => [...current, playlist].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedPlaylistId(playlist.id);
      setPlaylistName("");
      toast.success("Playlist created.");
    } catch {
      toast.error("Playlist couldn't be saved on this device.");
    }
  }

  async function addTracks(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (!user?.id || !selectedPlaylistId || !files.length) return;
    setSaving(true);
    try {
      const added: MusicTrack[] = [];
      for (const file of files) {
        if (!file.type.startsWith("audio/")) continue;
        const track: MusicTrack = {
          id: crypto.randomUUID(),
          userId: user.id,
          playlistId: selectedPlaylistId,
          title: file.name.replace(/\.[^.]+$/, "").slice(0, 120) || "Untitled track",
          audio: file,
        };
        await saveMusicRecord("tracks", track);
        added.push(track);
      }
      if (added.length) {
        setTracks((current) => [...current, ...added]);
        toast.success(`${added.length} ${added.length === 1 ? "track" : "tracks"} added.`);
      } else {
        toast.error("Choose audio files to add to your playlist.");
      }
    } catch {
      toast.error("Some audio couldn't be saved. Your device may be low on storage.");
      const library = await readMusicLibrary(user.id).catch(() => null);
      if (library) setTracks(library.tracks);
    } finally {
      setSaving(false);
    }
  }

  function toggleTrack(track: MusicTrack) {
    const audio = audioRef.current;
    if (!audio) return;
    if (currentTrackId === track.id && !audio.paused) {
      audio.pause();
      setPlaying(false);
      return;
    }
    if (currentTrackId !== track.id) {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      const url = URL.createObjectURL(track.audio);
      objectUrlRef.current = url;
      audio.src = url;
      setCurrentTrackId(track.id);
    }
    void audio.play().then(() => setPlaying(true)).catch(() => {
      setPlaying(false);
      toast.error("This audio file couldn't be played in your browser.");
    });
  }

  async function deleteTrack(track: MusicTrack) {
    try {
      if (currentTrackId === track.id) {
        audioRef.current?.pause();
        audioRef.current?.removeAttribute("src");
        setCurrentTrackId(null);
        setPlaying(false);
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      await removeMusicTrack(track.id);
      setTracks((current) => current.filter((item) => item.id !== track.id));
    } catch {
      toast.error("Track couldn't be removed.");
    }
  }

  async function deletePlaylist(playlist: MusicPlaylist) {
    try {
      if (playlistTracks.some((track) => track.id === currentTrackId)) {
        audioRef.current?.pause();
        audioRef.current?.removeAttribute("src");
        setCurrentTrackId(null);
        setPlaying(false);
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      await removeMusicPlaylist(playlist.id);
      const remainingPlaylists = playlists.filter((item) => item.id !== playlist.id);
      setPlaylists(remainingPlaylists);
      setTracks((current) => current.filter((track) => track.playlistId !== playlist.id));
      setSelectedPlaylistId(remainingPlaylists[0]?.id ?? "");
      toast.success("Playlist removed.");
    } catch {
      toast.error("Playlist couldn't be removed.");
    }
  }

  return (
    <section className="mt-6 rounded-3xl border border-border/70 bg-card/70 p-5 sm:p-6" aria-labelledby="music-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-secondary text-primary">
            <Music2 className="size-5" />
          </span>
          <div>
            <h2 id="music-title" className="text-xl">Music & playlists</h2>
            <p className="mt-1 text-sm text-muted-foreground">Make a little listening space for yourself.</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Private to your account on this device</p>
      </div>

      {!user?.id ? (
        <p className="mt-5 text-sm text-muted-foreground">Sign in to make your music playlists.</p>
      ) : (
        <>
          <form
            className="mt-5 flex flex-col gap-2 sm:flex-row"
            onSubmit={(event) => { event.preventDefault(); void createPlaylist(); }}
          >
            <Input
              value={playlistName}
              onChange={(event) => setPlaylistName(event.target.value)}
              maxLength={60}
              placeholder="Give your playlist a name"
              aria-label="New playlist name"
            />
            <Button type="submit" className="shrink-0 rounded-full" disabled={!playlistName.trim()}>
              <Plus className="mr-1 size-4" /> Create playlist
            </Button>
          </form>

          {loading ? (
            <p className="mt-5 text-sm text-muted-foreground">Loading your music…</p>
          ) : playlists.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-dashed border-border p-6 text-center">
              <ListMusic className="mx-auto size-6 text-muted-foreground" />
              <p className="mt-2 text-sm">Your playlists will live here.</p>
              <p className="mt-1 text-xs text-muted-foreground">Create one above, then add audio from your device.</p>
            </div>
          ) : (
            <>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
                <label className="sr-only" htmlFor="music-playlist">Choose playlist</label>
                <select
                  id="music-playlist"
                  value={selectedPlaylistId}
                  onChange={(event) => setSelectedPlaylistId(event.target.value)}
                  className="h-10 min-w-0 flex-1 rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {playlists.map((playlist) => <option key={playlist.id} value={playlist.id}>{playlist.name}</option>)}
                </select>
                <div className="flex gap-2">
                  <label className={cn("inline-flex h-10 cursor-pointer items-center justify-center rounded-full border border-input px-4 text-sm transition-colors hover:bg-accent", saving && "pointer-events-none opacity-50")}>
                    <Upload className="mr-2 size-4" />
                    {saving ? "Adding…" : "Add audio"}
                    <input type="file" accept="audio/*" multiple className="sr-only" disabled={saving || !selectedPlaylistId} onChange={(event) => void addTracks(event)} />
                  </label>
                  {selectedPlaylist && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="rounded-full text-muted-foreground"
                      aria-label={`Delete ${selectedPlaylist.name} playlist`}
                      title="Delete playlist"
                      onClick={() => void deletePlaylist(selectedPlaylist)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              </div>

              <div className="mt-4 divide-y divide-border/70">
                {playlistTracks.length === 0 ? (
                  <p className="py-5 text-center text-sm text-muted-foreground">No tracks yet. Add audio from your device to get started.</p>
                ) : playlistTracks.map((track) => (
                  <div key={track.id} className="flex min-w-0 items-center gap-3 py-3">
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      className="size-9 shrink-0 rounded-full"
                      aria-label={`${currentTrackId === track.id && playing ? "Pause" : "Play"} ${track.title}`}
                      onClick={() => toggleTrack(track)}
                    >
                      {currentTrackId === track.id && playing ? <Pause className="size-4" /> : <Play className="size-4" />}
                    </Button>
                    <p className="min-w-0 flex-1 truncate text-sm">{track.title}</p>
                    {currentTrackId === track.id && (
                      <span className="text-xs text-muted-foreground">{playing ? "Playing" : "Paused"}</span>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 shrink-0 rounded-full text-muted-foreground"
                      aria-label={`Remove ${track.title}`}
                      title="Remove track"
                      onClick={() => void deleteTrack(track)}
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
      <audio
        ref={audioRef}
        className="hidden"
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
        onEnded={() => setPlaying(false)}
      />
    </section>
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
      <MusicLibrary />
    </div>
  );
}
