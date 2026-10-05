import fs from 'node:fs/promises'

const RETRYABLE_RENAME_ERRORS = new Set(['EPERM', 'EACCES', 'EBUSY'])

/**
 * Replace `file` in one step. A running server reads the generated JSON while the
 * generator runs, so it must only ever see the complete old file or the complete
 * new one. `rename` within one directory gives that guarantee; `writeFile` does not.
 */
export async function writeFileAtomic(file: string, data: string): Promise<void> {
	const tempFile = `${file}.${process.pid}.tmp`
	await fs.writeFile(tempFile, data)
	for (let attempt = 1; ; attempt++) {
		try {
			await fs.rename(tempFile, file)
			return
		} catch (error) {
			// Windows refuses to replace a file while another process has it open.
			// The server only holds it for one read, so a short retry succeeds.
			const code = (error as NodeJS.ErrnoException).code
			if (attempt >= 5 || code === undefined || !RETRYABLE_RENAME_ERRORS.has(code)) {
				await fs.rm(tempFile, { force: true })
				throw error
			}
			await new Promise((resolve) => setTimeout(resolve, 20 * attempt))
		}
	}
}
