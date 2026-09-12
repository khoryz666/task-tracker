import webpush from "web-push";

const { GIST_PAT, GIST_ID, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_CONTACT_EMAIL, GROQ_API_KEY } = process.env;

function requireEnv(name, value) {
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

async function fetchGistFile(filename, fallback) {
  const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    headers: {
      Authorization: `Bearer ${GIST_PAT}`,
      Accept: "application/vnd.github+json",
    },
  });
  if (!res.ok) throw new Error(`Failed to fetch gist: HTTP ${res.status}`);
  const json = await res.json();
  const content = json.files[filename]?.content;
  return content ? JSON.parse(content) : fallback;
}

function daysUntil(deadline) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${deadline}T00:00:00`);
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

/** Most urgent not-done task due within 3 days, critical tasks first. */
function pickUrgentTask(tasks) {
  const candidates = tasks
    .filter((t) => !t.deletedAt && t.status !== "done" && t.deadline)
    .map((t) => ({ ...t, days: daysUntil(t.deadline) }))
    .filter((t) => t.days <= 3)
    .sort((a, b) => {
      if (a.critical !== b.critical) return a.critical ? -1 : 1;
      return a.days - b.days;
    });
  return candidates[0] ?? null;
}

function whenPhrase(days) {
  if (days < 0) return `${Math.abs(days)} day(s) overdue`;
  if (days === 0) return "due today";
  return `due in ${days} day(s)`;
}

async function encouragingLine(task) {
  const fallback = task
    ? `${task.title} is ${whenPhrase(task.days)} - you've got this.`
    : "You're all caught up. Nice work.";
  if (!GROQ_API_KEY) return fallback;

  const prompt = task
    ? `Write one short, concise, encouraging sentence (max 20 words, no hashtags, no emoji) reminding someone about this task: "${task.title}", ${whenPhrase(task.days)}.`
    : "Write one short, concise, encouraging sentence (max 20 words, no hashtags, no emoji) telling someone they're all caught up on their tasks.";

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 60,
        temperature: 0.7,
      }),
    });
    if (!res.ok) throw new Error(`Groq API error: HTTP ${res.status}`);
    const json = await res.json();
    return json.choices?.[0]?.message?.content?.trim() || fallback;
  } catch (err) {
    console.error("Groq call failed, using fallback message:", err.message);
    return fallback;
  }
}

async function main() {
  requireEnv("GIST_PAT", GIST_PAT);
  requireEnv("GIST_ID", GIST_ID);
  requireEnv("VAPID_PUBLIC_KEY", VAPID_PUBLIC_KEY);
  requireEnv("VAPID_PRIVATE_KEY", VAPID_PRIVATE_KEY);

  webpush.setVapidDetails(
    `mailto:${VAPID_CONTACT_EMAIL || "example@example.com"}`,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY,
  );

  const { tasks = [] } = await fetchGistFile("tasks.json", { tasks: [] });
  const { subscriptions = [] } = await fetchGistFile("subscriptions.json", { subscriptions: [] });

  if (subscriptions.length === 0) {
    console.log("No push subscriptions registered yet - nothing to do.");
    return;
  }

  const urgent = pickUrgentTask(tasks);
  const body = await encouragingLine(urgent);
  const payload = JSON.stringify({
    title: urgent ? `Reminder: ${urgent.title}` : "Task Tracker",
    body,
    url: "./index.html",
  });

  console.log(`Sending to ${subscriptions.length} subscription(s): ${body}`);

  const results = await Promise.allSettled(subscriptions.map((sub) => webpush.sendNotification(sub, payload)));

  results.forEach((r, i) => {
    if (r.status === "rejected") {
      console.error(`Push failed for subscription ${i} (${subscriptions[i].endpoint}): ${r.reason?.message ?? r.reason}`);
    }
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
