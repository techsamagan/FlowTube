import { Link } from 'react-router-dom'

const FEATURES = [
  {
    icon: '🧠',
    title: 'AI Concept Generation',
    desc: 'Claude crafts viral hooks, scripts, and image prompts tailored to your channel brand.',
  },
  {
    icon: '🎨',
    title: 'Automatic Visuals',
    desc: 'DALL-E 3 generates cinematic 9:16 portrait images for every scene of your Short.',
  },
  {
    icon: '🎤',
    title: 'Natural Voiceover',
    desc: 'Edge TTS converts your script into a crisp MP3 voiceover — no recording needed.',
  },
  {
    icon: '🎵',
    title: 'Background Music',
    desc: 'Mood-matched background music is synthesised and mixed at the perfect volume under the voiceover.',
  },
  {
    icon: '🎬',
    title: 'One-Click Assembly',
    desc: 'MoviePy stitches everything into a ready-to-publish 1080×1920 MP4 in seconds.',
  },
  {
    icon: '📤',
    title: 'YouTube Upload',
    desc: 'Preview the video, then approve — or let the scheduler publish it automatically.',
  },
]

const STEPS = [
  { num: '01', title: 'Connect your channel', desc: 'Authorize FlowTube with your YouTube account via Google OAuth.' },
  { num: '02', title: 'Describe your brand', desc: 'Give Claude your channel name, genre, and a style brief.' },
  { num: '03', title: 'Queue ideas', desc: 'Add ideas manually or let AI generate 10 fresh concepts in one click.' },
  { num: '04', title: 'Generate & preview', desc: 'Trigger a job — the AI pipeline runs end-to-end and shows you a preview.' },
  { num: '05', title: 'Approve & publish', desc: 'Upload instantly, schedule for later, or reject and regenerate.' },
]

const MODELS = [
  { name: 'Anthropic', tag: 'Default', desc: 'Claude + DALL-E 3 + edge-tts pipeline. Best quality, full control.' },
  { name: 'Kling AI', tag: 'Video AI', desc: 'Text-to-video generation at 9:16 via Kling\'s v1.6 model.' },
  { name: 'Sora', tag: 'Video AI', desc: 'OpenAI\'s Sora model for high-fidelity portrait video clips.' },
  { name: 'Veo 2', tag: 'Video AI', desc: 'Google\'s Veo 2 model accessed through Google AI Studio.' },
]

export default function Landing() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">

      {/* Nav */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-gray-950/80 backdrop-blur border-b border-gray-800">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-red-500 text-2xl font-black tracking-tight">Flow</span>
            <span className="text-white text-2xl font-black tracking-tight">Tube</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="text-sm text-gray-400 hover:text-white transition px-4 py-2"
            >
              Sign in
            </Link>
            <Link
              to="/register"
              className="bg-red-600 hover:bg-red-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
            >
              Get started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-40 pb-28 px-6 text-center relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-red-700/10 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-4xl mx-auto space-y-6">
          <div className="inline-flex items-center gap-2 bg-red-900/30 border border-red-800/50 text-red-400 text-xs font-semibold px-4 py-1.5 rounded-full">
            <span className="w-1.5 h-1.5 bg-red-400 rounded-full animate-pulse" />
            Powered by Claude AI
          </div>

          <h1 className="text-5xl sm:text-6xl md:text-7xl font-black leading-tight">
            YouTube Shorts,{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-red-600">
              on autopilot
            </span>
          </h1>

          <p className="text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
            FlowTube writes the script, generates the visuals, records the voiceover,
            mixes the music, assembles the video, and uploads it to YouTube — fully automatically.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
            <Link
              to="/register"
              className="bg-red-600 hover:bg-red-500 text-white font-semibold px-8 py-3.5 rounded-xl transition text-base"
            >
              Start for free
            </Link>
            <Link
              to="/login"
              className="bg-gray-800 hover:bg-gray-700 text-white font-semibold px-8 py-3.5 rounded-xl transition text-base border border-gray-700"
            >
              Sign in
            </Link>
          </div>

          <p className="text-xs text-gray-600 pt-2">
            No credit card required · Bring your own API keys
          </p>
        </div>
      </section>

      {/* Pipeline preview */}
      <section className="py-16 px-6 border-y border-gray-800 bg-gray-900/30">
        <div className="max-w-5xl mx-auto">
          <p className="text-center text-xs text-gray-500 uppercase tracking-widest mb-8 font-semibold">
            The full pipeline — zero manual steps
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
            {[
              { label: 'Concept', icon: '🧠' },
              { label: 'Images', icon: '🎨' },
              { label: 'Voiceover', icon: '🎤' },
              { label: 'Music', icon: '🎵' },
              { label: 'Assembly', icon: '🎬' },
              { label: 'Preview', icon: '👁' },
              { label: 'YouTube', icon: '📤' },
            ].map((step, i, arr) => (
              <div key={step.label} className="flex items-center gap-2">
                <div className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5">
                  <span>{step.icon}</span>
                  <span className="font-medium text-gray-200">{step.label}</span>
                </div>
                {i < arr.length - 1 && (
                  <span className="text-gray-600 text-lg">→</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-black mb-4">Everything included</h2>
            <p className="text-gray-400 max-w-xl mx-auto">
              Every tool you need to produce and publish Shorts at scale — with no video editing skills required.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map(f => (
              <div
                key={f.title}
                className="bg-gray-900 border border-gray-800 rounded-2xl p-6 hover:border-gray-700 transition group"
              >
                <div className="text-3xl mb-4">{f.icon}</div>
                <h3 className="font-bold text-white mb-2">{f.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-24 px-6 bg-gray-900/40 border-y border-gray-800">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-black mb-4">How it works</h2>
            <p className="text-gray-400">From zero to published in five steps.</p>
          </div>
          <div className="space-y-6">
            {STEPS.map((s, i) => (
              <div key={s.num} className="flex gap-5 items-start">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-900/40 border border-red-800/50 flex items-center justify-center">
                  <span className="text-xs font-black text-red-400">{s.num}</span>
                </div>
                <div className="pt-1.5">
                  <h3 className="font-bold text-white mb-1">{s.title}</h3>
                  <p className="text-sm text-gray-400 leading-relaxed">{s.desc}</p>
                </div>
                {i < STEPS.length - 1 && (
                  <div className="absolute" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Models */}
      <section className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-black mb-4">Choose your video model</h2>
            <p className="text-gray-400 max-w-xl mx-auto">
              Generate with the Anthropic pipeline or pick a dedicated AI video model.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-5">
            {MODELS.map(m => (
              <div
                key={m.name}
                className={`bg-gray-900 border rounded-2xl p-6 ${
                  m.name === 'Anthropic'
                    ? 'border-red-700/50 ring-1 ring-red-700/20'
                    : 'border-gray-800'
                }`}
              >
                <div className="flex items-center gap-3 mb-3">
                  <h3 className="font-bold text-white">{m.name}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                    m.name === 'Anthropic'
                      ? 'bg-red-900/50 text-red-400'
                      : 'bg-gray-800 text-gray-400'
                  }`}>
                    {m.tag}
                  </span>
                </div>
                <p className="text-sm text-gray-400 leading-relaxed">{m.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Scheduling */}
      <section className="py-24 px-6 bg-gray-900/40 border-y border-gray-800">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center gap-12">
          <div className="flex-1 space-y-4">
            <h2 className="text-3xl sm:text-4xl font-black">Set it and forget it</h2>
            <p className="text-gray-400 leading-relaxed">
              Create a cron schedule for any channel. FlowTube generates a new Short, previews it,
              and uploads it automatically — whether you're awake or not.
            </p>
            <ul className="space-y-2 text-sm text-gray-300">
              {[
                'Every day at 9am',
                'Twice daily (9am & 6pm)',
                'Every Monday morning',
                'Any custom cron expression',
              ].map(item => (
                <li key={item} className="flex items-center gap-2">
                  <span className="text-green-400">✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex-1 bg-gray-900 border border-gray-700 rounded-2xl p-6 font-mono text-sm space-y-3">
            <p className="text-gray-500 text-xs uppercase tracking-wider">Schedule</p>
            {[
              { cron: '0 9 * * *', label: 'Every day at 9am', active: true },
              { cron: '0 9,18 * * *', label: 'Twice daily', active: false },
              { cron: '0 9 * * 1', label: 'Every Monday', active: true },
            ].map(s => (
              <div key={s.cron} className="flex items-center justify-between gap-4">
                <code className="text-gray-200">{s.cron}</code>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  s.active ? 'bg-green-900/50 text-green-400' : 'bg-gray-800 text-gray-500'
                }`}>
                  {s.active ? '● Active' : '○ Paused'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-28 px-6 text-center">
        <div className="max-w-2xl mx-auto space-y-6">
          <h2 className="text-4xl sm:text-5xl font-black">
            Ready to go viral?
          </h2>
          <p className="text-gray-400 text-lg">
            Create your account and publish your first AI-generated Short today.
          </p>
          <Link
            to="/register"
            className="inline-block bg-red-600 hover:bg-red-500 text-white font-bold px-10 py-4 rounded-xl transition text-lg"
          >
            Get started free
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-8 px-6 text-center">
        <div className="flex items-center justify-center gap-1 mb-2">
          <span className="text-red-500 font-black">Flow</span>
          <span className="text-white font-black">Tube</span>
        </div>
        <p className="text-xs text-gray-600">YouTube Shorts AI agent · Built with Claude</p>
      </footer>
    </div>
  )
}
