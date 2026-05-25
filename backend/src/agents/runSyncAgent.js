import { syncAgentRun } from './syncAgent.js';

async function main() {
  const result = await syncAgentRun();
  console.log('Sync agent completed successfully.');
  console.log(`Source branch: ${result.sourceBranch}`);
  console.log(`Source: ${result.sourceDisplay}`);
  console.log(`Target: ${result.targetDisplay}`);
  console.log(`Clean target before sync: ${result.cleanTarget ? 'yes' : 'no'}`);
  console.log(`Include metadata files: ${result.includeMetadata ? 'yes' : 'no'}`);

  if (result.git.enabled) {
    console.log(`Git auto-commit: ${result.git.committed ? 'yes' : 'no'}`);
    if (result.git.commitSha) {
      console.log(`Commit SHA: ${result.git.commitSha}`);
    }
    console.log(`Git auto-push: ${result.git.pushed ? 'yes' : 'no'}`);
    if (result.git.pushBranch) {
      console.log(`Push branch: ${result.git.pushBranch}`);
    }
    console.log(`PR mode: ${result.git.createPr ? 'yes' : 'no'}`);
    if (result.git.prHeadBranch) {
      console.log(`PR head branch: ${result.git.prHeadBranch}`);
    }
    if (result.git.prCreated) {
      console.log('PR created: yes');
    }
    if (result.git.prUrl) {
      console.log(`PR URL: ${result.git.prUrl}`);
    }
  }
}

main().catch((error) => {
  console.error('Sync agent failed.');
  console.error(error.message || error);
  process.exitCode = 1;
});
