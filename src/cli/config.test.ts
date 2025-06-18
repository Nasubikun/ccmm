import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { makeConfigCommand } from './config.js'
import { ensureDir, expandTilde } from '../core/fs.js'
import inquirer from 'inquirer'

// Mock modules
vi.mock('inquirer')
vi.mock('../core/fs.js', async () => {
  const actual = await vi.importActual('../core/fs.js')
  return {
    ...actual,
    expandTilde: vi.fn((p: string) => p.replace(/^~/, '/home/test')),
  }
})

describe('config command', () => {
  let tempDir: string
  let configPath: string
  let originalConsoleLog: typeof console.log
  let logOutput: string[]

  beforeEach(async () => {
    // Create temp directory
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ccmm-test-'))
    configPath = path.join(tempDir, 'config.json')

    // Capture console output
    logOutput = []
    originalConsoleLog = console.log
    console.log = (...args: any[]) => {
      logOutput.push(args.map(String).join(' '))
    }

    // Set HOME to temp directory and mock expandTilde to use tempDir
    process.env.HOME = tempDir
    vi.mocked(expandTilde).mockImplementation((p: string) => 
      p.replace(/^~/, tempDir)
    )
  })

  afterEach(async () => {
    // Restore console.log
    console.log = originalConsoleLog

    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true })

    // Clear mocks
    vi.clearAllMocks()
  })

  describe('config list', () => {
    it('should show message when no repositories configured', async () => {
      // Create empty config
      const ccmmDir = path.join(tempDir, '.ccmm')
      await fs.mkdir(ccmmDir, { recursive: true })
      await fs.writeFile(
        path.join(ccmmDir, 'config.json'),
        JSON.stringify({ version: '1.0.0', defaultPresetRepositories: [] })
      )

      const cmd = makeConfigCommand()
      const listCmd = cmd.commands.find((c) => c.name() === 'list')
      await listCmd?.parseAsync([], { from: 'user' })

      expect(logOutput).toContain('No preset repositories configured.')
      expect(logOutput).toContain('Use "ccmm config add" to add a repository.')
    })

    it('should list configured repositories', async () => {
      // Create config with repositories
      const ccmmDir = path.join(tempDir, '.ccmm')
      await fs.mkdir(ccmmDir, { recursive: true })
      await fs.writeFile(
        path.join(ccmmDir, 'config.json'),
        JSON.stringify({
          version: '1.0.0',
          defaultPresetRepositories: [
            'github.com/org1/repo1',
            'github.com/org2/repo2',
          ],
        })
      )

      const cmd = makeConfigCommand()
      const listCmd = cmd.commands.find((c) => c.name() === 'list')
      await listCmd?.parseAsync([], { from: 'user' })

      expect(logOutput).toContain('Configured preset repositories:')
      expect(logOutput).toContain('  1. github.com/org1/repo1')
      expect(logOutput).toContain('  2. github.com/org2/repo2')
    })
  })

  describe('config add', () => {
    it('should add repository from command line argument', async () => {
      // Create config
      const ccmmDir = path.join(tempDir, '.ccmm')
      await fs.mkdir(ccmmDir, { recursive: true })
      await fs.writeFile(
        path.join(ccmmDir, 'config.json'),
        JSON.stringify({ version: '1.0.0', defaultPresetRepositories: [] })
      )

      const cmd = makeConfigCommand()
      const addCmd = cmd.commands.find((c) => c.name() === 'add')
      await addCmd?.parseAsync(['github.com/neworg/newrepo'], {
        from: 'user',
      })

      // Check config was updated
      const config = JSON.parse(await fs.readFile(path.join(tempDir, '.ccmm', 'config.json'), 'utf-8'))
      expect(config.defaultPresetRepositories).toContain(
        'github.com/neworg/newrepo'
      )
      expect(logOutput).toContain('✓ Added repository: github.com/neworg/newrepo')
    })

    it('should prompt for repository if not provided', async () => {
      // Mock inquirer prompt
      vi.mocked(inquirer.prompt).mockResolvedValueOnce({
        repository: 'github.com/prompted/repo',
      })

      // Create config
      const ccmmDir = path.join(tempDir, '.ccmm')
      await fs.mkdir(ccmmDir, { recursive: true })
      await fs.writeFile(
        path.join(ccmmDir, 'config.json'),
        JSON.stringify({ version: '1.0.0', defaultPresetRepositories: [] })
      )

      const cmd = makeConfigCommand()
      const addCmd = cmd.commands.find((c) => c.name() === 'add')
      await addCmd?.parseAsync([], { from: 'user' })

      // Check config was updated
      const config = JSON.parse(await fs.readFile(path.join(tempDir, '.ccmm', 'config.json'), 'utf-8'))
      expect(config.defaultPresetRepositories).toContain(
        'github.com/prompted/repo'
      )
      expect(logOutput).toContain('✓ Added repository: github.com/prompted/repo')
    })

    it('should not add duplicate repository', async () => {
      // Create config with existing repository
      const ccmmDir = path.join(tempDir, '.ccmm')
      await fs.mkdir(ccmmDir, { recursive: true })
      await fs.writeFile(
        path.join(ccmmDir, 'config.json'),
        JSON.stringify({
          version: '1.0.0',
          defaultPresetRepositories: ['github.com/existing/repo'],
        })
      )

      const cmd = makeConfigCommand()
      const addCmd = cmd.commands.find((c) => c.name() === 'add')
      await addCmd?.parseAsync(['github.com/existing/repo'], {
        from: 'user',
      })

      expect(logOutput).toContain(
        'Repository "github.com/existing/repo" is already in the list.'
      )
    })
  })

  describe('config remove', () => {
    it('should remove repository when confirmed', async () => {
      // Mock confirmation
      vi.mocked(inquirer.prompt).mockResolvedValueOnce({
        confirm: true,
      })

      // Create config with repositories
      const ccmmDir = path.join(tempDir, '.ccmm')
      await fs.mkdir(ccmmDir, { recursive: true })
      await fs.writeFile(
        path.join(ccmmDir, 'config.json'),
        JSON.stringify({
          version: '1.0.0',
          defaultPresetRepositories: [
            'github.com/org1/repo1',
            'github.com/org2/repo2',
          ],
        })
      )

      const cmd = makeConfigCommand()
      const removeCmd = cmd.commands.find((c) => c.name() === 'remove')
      await removeCmd?.parseAsync(['github.com/org1/repo1'], {
        from: 'user',
      })

      // Check config was updated
      const config = JSON.parse(await fs.readFile(path.join(tempDir, '.ccmm', 'config.json'), 'utf-8'))
      expect(config.defaultPresetRepositories).not.toContain(
        'github.com/org1/repo1'
      )
      expect(config.defaultPresetRepositories).toContain('github.com/org2/repo2')
      expect(logOutput).toContain('✓ Removed repository: github.com/org1/repo1')
    })

    it('should cancel removal when not confirmed', async () => {
      // Mock declining confirmation
      vi.mocked(inquirer.prompt).mockResolvedValueOnce({
        confirm: false,
      })

      // Create config with repositories
      const ccmmDir = path.join(tempDir, '.ccmm')
      await fs.mkdir(ccmmDir, { recursive: true })
      await fs.writeFile(
        path.join(ccmmDir, 'config.json'),
        JSON.stringify({
          version: '1.0.0',
          defaultPresetRepositories: ['github.com/org1/repo1'],
        })
      )

      const cmd = makeConfigCommand()
      const removeCmd = cmd.commands.find((c) => c.name() === 'remove')
      await removeCmd?.parseAsync(['github.com/org1/repo1'], {
        from: 'user',
      })

      // Check config was not changed
      const config = JSON.parse(await fs.readFile(path.join(tempDir, '.ccmm', 'config.json'), 'utf-8'))
      expect(config.defaultPresetRepositories).toContain('github.com/org1/repo1')
      expect(logOutput).toContain('Removal cancelled.')
    })

    it('should prompt for selection if no repository provided', async () => {
      // Mock selection and confirmation
      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({
          repository: 'github.com/org2/repo2',
        })
        .mockResolvedValueOnce({
          confirm: true,
        })

      // Create config with repositories
      const ccmmDir = path.join(tempDir, '.ccmm')
      await fs.mkdir(ccmmDir, { recursive: true })
      await fs.writeFile(
        path.join(ccmmDir, 'config.json'),
        JSON.stringify({
          version: '1.0.0',
          defaultPresetRepositories: [
            'github.com/org1/repo1',
            'github.com/org2/repo2',
          ],
        })
      )

      const cmd = makeConfigCommand()
      const removeCmd = cmd.commands.find((c) => c.name() === 'remove')
      await removeCmd?.parseAsync([], { from: 'user' })

      // Check config was updated
      const config = JSON.parse(await fs.readFile(path.join(tempDir, '.ccmm', 'config.json'), 'utf-8'))
      expect(config.defaultPresetRepositories).not.toContain(
        'github.com/org2/repo2'
      )
      expect(logOutput).toContain('✓ Removed repository: github.com/org2/repo2')
    })
  })

  describe('repository format validation', () => {
    it('should reject invalid repository format when adding', async () => {
      // Create config
      const ccmmDir = path.join(tempDir, '.ccmm')
      await fs.mkdir(ccmmDir, { recursive: true })
      await fs.writeFile(
        path.join(ccmmDir, 'config.json'),
        JSON.stringify({ version: '1.0.0', defaultPresetRepositories: [] })
      )

      const cmd = makeConfigCommand()
      const addCmd = cmd.commands.find((c) => c.name() === 'add')

      // Mock process.exit to prevent test from exiting
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Process exited')
      })

      try {
        await addCmd?.parseAsync(['invalid-format'], { from: 'user' })
      } catch (e) {
        // Expected to throw due to mocked process.exit
      }

      expect(mockExit).toHaveBeenCalledWith(1)
      mockExit.mockRestore()
    })
  })
})