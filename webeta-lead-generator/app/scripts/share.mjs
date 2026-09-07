#!/usr/bin/env node
import { spawn } from 'child_process';
import { createInterface } from 'readline';

const CLOUDFLARED = 'D:\\projects\\webeta-lead-generator\\webeta-lead-generator\\cloudflared.exe';
const ARGS = ['tunnel', '--protocol', 'http2', '--url', 'http://localhost:3000'];

// ANSI color codes
const RESET   = '\x1b[0m';
const BOLD    = '\x1b[1m';
const CYAN    = '\x1b[36m';
const GREEN   = '\x1b[32m';
const BG_BLUE = '\x1b[44m';
const WHITE   = '\x1b[37m';

function printBanner(url) {
  const border = '═'.repeat(url.length + 6);
  console.log('\n');
  console.log(`${GREEN}${BOLD}  ╔${border}╗${RESET}`);
  console.log(`${GREEN}${BOLD}  ║   ${BG_BLUE}${WHITE}${BOLD} 🔗 TUNNEL URL ${RESET}${GREEN}${BOLD}   ║${RESET}`);
  console.log(`${GREEN}${BOLD}  ║   ${RESET}${CYAN}${BOLD} ${url} ${RESET}${GREEN}${BOLD}   ║${RESET}`);
  console.log(`${GREEN}${BOLD}  ╚${border}╝${RESET}`);
  console.log('\n');
}

const child = spawn(CLOUDFLARED, ARGS, { stdio: ['inherit', 'pipe', 'pipe'] });

const rl_stdout = createInterface({ input: child.stdout });
const rl_stderr = createInterface({ input: child.stderr });

function processLine(line) {
  const match = line.match(/https:\/\/[a-z0-9\-]+\.trycloudflare\.com/);
  if (match) {
    printBanner(match[0]);
  } else {
    process.stdout.write(`\x1b[2m${line}\x1b[0m\n`);
  }
}

rl_stdout.on('line', processLine);
rl_stderr.on('line', processLine);

child.on('exit', (code) => process.exit(code ?? 0));
