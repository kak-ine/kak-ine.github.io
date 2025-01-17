const core = require('@actions/core');
const github = require('@actions/github');

try {
  const name = core.getInput('name');
  console.log(`Hello, ${name}!`);
} catch (error) {
  core.setFailed(error.message);
}
