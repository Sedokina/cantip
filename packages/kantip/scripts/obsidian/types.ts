import { z } from 'zod'
import { stripLeadingAndTrailingSlashes } from './path.ts'

export const obsidianConfigSchema = z.object({
  configFolder: z.string().startsWith('.').default('.obsidian'),
  copyFrontmatter: z.boolean().default(false),
  ignore: z.array(z.string()).default([]),
  math: z
    .object({
      singleDollarTextMath: z.boolean().default(true),
    })
    .prefault({}),
  output: z
    .string()
    .default('notes')
    .refine(
      (value) => {
        const label = stripLeadingAndTrailingSlashes(value)
        // '.' is allowed: it means the "root" output (the general/no-project
        // bucket writes straight into the content/public roots, no subdir), so
        // its docs get root-level ids and are served at `/`.
        return label === '.' || (label !== '' && !label.startsWith('..'))
      },
      { error: "The `output` directory cannot be empty or start with '..'." },
    ),
  skipGeneration: z.boolean().default(false),
  vault: z.string(),
})

export type ObsidianConfig = z.output<typeof obsidianConfigSchema>
export type ObsidianUserConfig = z.input<typeof obsidianConfigSchema>
