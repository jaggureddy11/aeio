import { describe, it, expect } from 'vitest';
import { routeUserIntent, TaskType } from '../lib/systemOne/intentRouting';

describe('Production Intent Classifier Suite (50 Diverse Benchmarks)', () => {
  const intentCases: Array<{ prompt: string; expected: TaskType; desc: string }> = [
    // --- 1. OS Control (10 cases) ---
    { prompt: 'Turn down the system volume by 20%', expected: 'os_control', desc: 'lower volume' },
    { prompt: 'Mute the audio right now', expected: 'os_control', desc: 'mute sound' },
    { prompt: 'Unmute speaker volume', expected: 'os_control', desc: 'unmute sound' },
    { prompt: 'Pause the current song on Spotify', expected: 'os_control', desc: 'pause spotify music' },
    { prompt: 'Play the next track', expected: 'os_control', desc: 'next song' },
    { prompt: 'Resume playing music on Spotify', expected: 'os_control', desc: 'resume spotify track' },
    { prompt: 'Take a full desktop screenshot', expected: 'os_control', desc: 'capture screenshot' },
    { prompt: 'Launch Google Chrome application', expected: 'os_control', desc: 'launch browser app' },
    { prompt: 'Open Finder window', expected: 'os_control', desc: 'open finder app' },
    { prompt: 'Show current battery status and health', expected: 'os_control', desc: 'check battery system' },

    // --- 2. Coding & Programming (10 cases) ---
    { prompt: 'Write a TypeScript function to reverse a linked list', expected: 'code', desc: 'typescript algorithm' },
    { prompt: 'Fix this syntax error in Rust pattern matching', expected: 'code', desc: 'rust compile bug' },
    { prompt: 'Refactor this python script to use asyncio', expected: 'code', desc: 'python async refactor' },
    { prompt: 'Debug why this javascript promise rejects', expected: 'code', desc: 'javascript error debugging' },
    { prompt: 'Create a bash script to backup logs daily', expected: 'code', desc: 'bash script generation' },
    { prompt: 'Explain this git rebase conflict error message', expected: 'code', desc: 'git conflict error' },
    { prompt: 'Write a regex to match valid IPv4 addresses in python', expected: 'code', desc: 'regex pattern code' },
    { prompt: 'Implement a binary search tree in C++', expected: 'code', desc: 'cpp tree implementation' },
    { prompt: 'How do I resolve npm peer dependency conflicts in package.json', expected: 'code', desc: 'npm package code error' },
    { prompt: 'Optimize this SQL query joining three large tables', expected: 'code', desc: 'sql query optimization' },

    // --- 3. Planning & Multi-Step Workflows (10 cases) ---
    { prompt: 'Create a step-by-step plan to migrate our database to AWS', expected: 'planning', desc: 'database migration plan' },
    { prompt: 'Break down the workflow to launch an open source library', expected: 'planning', desc: 'open source release workflow' },
    { prompt: 'Organize an end-to-end audit for web accessibility', expected: 'planning', desc: 'accessibility audit roadmap' },
    { prompt: 'Automate our weekly data sync between Postgres and Snowflake', expected: 'planning', desc: 'automate workflow data pipeline' },
    { prompt: 'Plan a structured rollout for our new authentication service', expected: 'planning', desc: 'service rollout execution plan' },
    { prompt: 'Architect a scalable multi-region microservices roadmap', expected: 'planning', desc: 'microservices architecture roadmap' },
    { prompt: 'Design a step-by-step backup and recovery drill', expected: 'planning', desc: 'disaster recovery plan' },
    { prompt: 'Execute a full system cleanup plan across all cache folders', expected: 'planning', desc: 'system cleanup plan' },
    { prompt: 'Generate an incident response checklist for server outages', expected: 'planning', desc: 'incident response workflow' },
    { prompt: 'Create an automated migration plan from Vite 4 to Vite 6', expected: 'planning', desc: 'vite migration plan' },

    // --- 4. Private Notes & Confidential Information (10 cases) ---
    { prompt: 'Save private note: my garage security lock PIN is 8492', expected: 'private_notes', desc: 'store private pin note' },
    { prompt: 'Remember this secret: production DB root password token', expected: 'private_notes', desc: 'save confidential secret token' },
    { prompt: 'Write a confidential entry in my personal diary', expected: 'private_notes', desc: 'confidential diary entry' },
    { prompt: 'Keep this note down strictly offline in my vault', expected: 'private_notes', desc: 'offline secret note down' },
    { prompt: 'Save note: doctor appointment follow up instructions', expected: 'private_notes', desc: 'save private medical note' },
    { prompt: 'Store this credential securely in my local memory', expected: 'private_notes', desc: 'secure personal credential' },
    { prompt: 'Note down: personal investment allocation strategy', expected: 'private_notes', desc: 'note down personal finance' },
    { prompt: 'Save private note: SSH private key backup passphrase', expected: 'private_notes', desc: 'private passphrase note' },
    { prompt: 'Record this secret idea in my journal', expected: 'private_notes', desc: 'secret idea journal note' },
    { prompt: 'Save confidential client meeting notes', expected: 'private_notes', desc: 'confidential meeting note' },

    // --- 5. Search, Memory & Retrieval (5 cases) ---
    { prompt: 'Search files for invoice receipts from last month', expected: 'search_retrieval', desc: 'search local invoice files' },
    { prompt: 'Find the document containing project milestones', expected: 'search_retrieval', desc: 'find milestone document' },
    { prompt: 'Recall what we discussed about serverless architecture last week', expected: 'search_retrieval', desc: 'recall past memory' },
    { prompt: 'Search my saved memories for book recommendations', expected: 'search_retrieval', desc: 'search saved memories' },
    { prompt: 'Lookup my notes on neural network architectures', expected: 'search_retrieval', desc: 'lookup saved study notes' },

    // --- 6. General Conversational (5 cases) ---
    { prompt: 'Good morning! How are you doing today?', expected: 'conversational', desc: 'friendly greeting hello' },
    { prompt: 'What is the meaning of resilience in computer engineering?', expected: 'conversational', desc: 'philosophical discussion' },
    { prompt: 'Tell me a lighthearted joke about programmers', expected: 'conversational', desc: 'casual talk joke' },
    { prompt: 'Hello Aeio, can we chat for a bit?', expected: 'conversational', desc: 'general chat conversation' },
    { prompt: 'What is your perspective on space exploration?', expected: 'conversational', desc: 'open ended talk perspective' },
  ];

  for (let i = 0; i < intentCases.length; i++) {
    const { prompt, expected, desc } = intentCases[i];
    it(`Case ${i + 1}/50: correctly classifies "${desc}" as [${expected}]`, async () => {
      const result = await routeUserIntent(prompt);
      expect(result.taskType).toBe(expected);
      expect(result.confidence).toBeGreaterThan(0.4);
    });
  }
});
