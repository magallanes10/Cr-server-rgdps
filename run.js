const { spawn } = require('child_process');

const child = spawn('npm', ['run', 'dev'], {
  stdio: 'inherit',
  shell: true,
  cwd: 'server'
});

child.on('error', (error) => {
  console.error('Error:', error);
});

child.on('close', (code) => {
  console.log(`Process exited with code ${code}`);
});