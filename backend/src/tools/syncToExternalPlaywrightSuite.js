import { syncGeneratedTestsToExternalSuite } from './syncGeneratedTests.js';

async function main() {
	const result = await syncGeneratedTestsToExternalSuite();

	console.log('Sync completed successfully.');
	console.log(`Source: ${result.sourceDisplay}`);
	console.log(`Target: ${result.targetDisplay}`);
	console.log(`Clean target before sync: ${result.cleanTarget ? 'yes' : 'no'}`);
	console.log(`Include metadata files: ${result.includeMetadata ? 'yes' : 'no'}`);
}

main().catch((error) => {
	console.error('Failed to sync generated tests to external Playwright suite.');
	console.error(error.message || error);
	process.exitCode = 1;
});
