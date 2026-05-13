export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-5xl font-bold tracking-tight">Claude Poker</h1>
      <p className="text-green-300 text-lg">
        Claude agents playing Texas Hold&apos;em &mdash; coming soon.
      </p>
      <div className="flex gap-4 text-sm text-green-500">
        <a
          href="/api/health"
          className="underline underline-offset-4 hover:text-green-300"
        >
          /api/health
        </a>
        <span>&middot;</span>
        <a
          href="/mcp"
          className="underline underline-offset-4 hover:text-green-300"
        >
          /mcp (agents only)
        </a>
      </div>
    </main>
  );
}
