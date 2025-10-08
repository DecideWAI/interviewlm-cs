'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';

export default function Home() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setTimeout(() => {
      setEmail('');
      setSubmitted(false);
    }, 3000);
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2,
        delayChildren: 0.3,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.8,
        ease: [0.6, -0.05, 0.01, 0.99],
      },
    },
  };

  return (
    <div className="min-h-screen bg-black relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-white/[0.02] rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-white/[0.02] rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-white/[0.01] rounded-full blur-2xl animate-float"></div>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-zinc-900/20 via-black to-black"></div>
      </div>

      {/* Main content */}
      <div className="relative z-10">
        <motion.main
          className="container mx-auto px-6 py-16 min-h-screen flex flex-col justify-between"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {/* Hero Section */}
          <div className="flex-1 flex flex-col justify-center items-center text-center max-w-5xl mx-auto">
            <motion.div variants={itemVariants} className="mb-8">
              <div className="inline-block">
                <span className="text-gray-400 text-sm font-semibold tracking-widest uppercase mb-4 block">
                  Coming Soon
                </span>
                <h1 className="text-6xl md:text-8xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white via-gray-200 to-gray-400 mb-6 animate-glow">
                  InterviewLM
                </h1>
              </div>
            </motion.div>

            <motion.h2
              variants={itemVariants}
              className="text-3xl md:text-5xl font-bold text-white mb-6 leading-tight"
            >
              The Future of AI-Powered
              <br />
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-gray-200 to-gray-400">
                Interview & Talent Hiring
              </span>
            </motion.h2>

            <motion.p
              variants={itemVariants}
              className="text-lg md:text-xl text-gray-300 mb-12 max-w-3xl leading-relaxed"
            >
              Experience the next generation of talent assessment. InterviewLM leverages advanced AI
              to recreate authentic work-like interview scenarios, providing accurate skill measurements
              and revolutionizing how companies discover exceptional talent.
            </motion.p>

            {/* Features Grid */}
            <motion.div
              variants={itemVariants}
              className="grid md:grid-cols-3 gap-6 mb-16 w-full max-w-4xl"
            >
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 hover:bg-zinc-800/50 hover:border-zinc-700 transition-all duration-300 hover:scale-105">
                <div className="text-4xl mb-4">🤖</div>
                <h3 className="text-xl font-semibold text-white mb-2">AI-Driven Simulations</h3>
                <p className="text-gray-400 text-sm">
                  Real-world work scenarios powered by advanced AI for authentic assessment
                </p>
              </div>

              <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 hover:bg-zinc-800/50 hover:border-zinc-700 transition-all duration-300 hover:scale-105">
                <div className="text-4xl mb-4">🎯</div>
                <h3 className="text-xl font-semibold text-white mb-2">Accurate Skill Measurement</h3>
                <p className="text-gray-400 text-sm">
                  Precisely evaluate competencies with data-driven insights and analytics
                </p>
              </div>

              <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 hover:bg-zinc-800/50 hover:border-zinc-700 transition-all duration-300 hover:scale-105">
                <div className="text-4xl mb-4">⚡</div>
                <h3 className="text-xl font-semibold text-white mb-2">Modern Platform</h3>
                <p className="text-gray-400 text-sm">
                  Sleek, intuitive interface designed for seamless hiring experiences
                </p>
              </div>
            </motion.div>

            {/* Email Signup */}
            <motion.div variants={itemVariants} className="w-full max-w-md">
              <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-4">
                <input
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="flex-1 px-6 py-4 rounded-xl bg-zinc-900 border border-zinc-800 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-white focus:border-transparent transition-all"
                />
                <button
                  type="submit"
                  className="px-8 py-4 bg-white text-black rounded-xl font-semibold hover:bg-gray-200 transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-white/20"
                >
                  {submitted ? 'Subscribed!' : 'Notify Me'}
                </button>
              </form>
              {submitted && (
                <p className="text-gray-300 text-sm mt-4 animate-pulse">
                  Thanks! We'll notify you when we launch.
                </p>
              )}
            </motion.div>
          </div>

          {/* Footer */}
          <motion.footer
            variants={itemVariants}
            className="mt-24 pt-12 border-t border-zinc-800 text-center"
          >
            <div className="max-w-4xl mx-auto">
              <p className="text-gray-500 mb-2">Owned by</p>
              <h3 className="text-xl font-semibold text-white mb-4">
                Corrirrus Innovations Pvt Ltd
              </h3>
              <p className="text-gray-600 text-sm mb-6">
                6/212, VV Nagar, Moondram Kattalai
                <br />
                Chennai - 600128, Tamil Nadu, India
              </p>
              <div className="flex justify-center gap-8 text-sm text-gray-600">
                <a href="#" className="hover:text-white transition-colors">
                  Privacy Policy
                </a>
                <a href="#" className="hover:text-white transition-colors">
                  Terms of Service
                </a>
                <a href="#" className="hover:text-white transition-colors">
                  Contact
                </a>
              </div>
              <p className="text-gray-700 text-xs mt-8">
                © 2025 Corrirrus Innovations Pvt Ltd. All rights reserved.
              </p>
            </div>
          </motion.footer>
        </motion.main>
      </div>
    </div>
  );
}
