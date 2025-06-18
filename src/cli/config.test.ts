import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { makeConfigCommand } from './config.js'
import { ensureDir, expandTilde } from '../core/fs.js'
import { clearConfigCache } from '../core/config.js'
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
  let originalConsoleError: typeof console.error
  let logOutput: string[]

  beforeEach(async () => {
    // Create temp directory
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ccmm-test-'))
    configPath = path.join(tempDir, 'config.json')

    // Capture console output
    logOutput = []
    originalConsoleLog = console.log
    originalConsoleError = console.error
    console.log = (...args: any[]) => {
      logOutput.push(args.map(String).join(' '))
    }
    console.error = (...args: any[]) => {
      logOutput.push(args.map(String).join(' '))
    }

    // Set HOME to temp directory and mock expandTilde to use tempDir
    process.env.HOME = tempDir
    vi.mocked(expandTilde).mockImplementation((p: string) => 
      p.replace(/^~/, tempDir)
    )

    // Clear config cache
    clearConfigCache()
  })

  afterEach(async () => {
    // Restore console.log and console.error
    console.log = originalConsoleLog
    console.error = originalConsoleError

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

      console.error('Debug output:', logOutput)
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

      console.error('Debug duplicate output:', logOutput)
      expect(logOutput).toContain(
        'Repository "github.com/existing/repo" is already in the list.'
      )
    })
  })

  describe('config remove', () => {
    it('should remove repository when confirmed', async () => {
      // Mock process.exit to prevent test from exiting
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Process exited')
      })

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

      try {
        await removeCmd?.parseAsync(['github.com/org1/repo1'], {
          from: 'user',
        })
      } catch (e) {
        // Expected due to process.exit mock
      }

      // Check config was updated
      const config = JSON.parse(await fs.readFile(path.join(tempDir, '.ccmm', 'config.json'), 'utf-8'))
      console.error('Debug remove output:', logOutput)
      expect(config.defaultPresetRepositories).not.toContain(
        'github.com/org1/repo1'
      )
      expect(config.defaultPresetRepositories).toContain('github.com/org2/repo2')
      expect(logOutput).toContain('✓ Removed repository: github.com/org1/repo1')
      
      mockExit.mockRestore()
    })

    it('should cancel removal when not confirmed', async () => {
      // Mock process.exit to prevent test from exiting
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Process exited')
      })

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

      try {
        await removeCmd?.parseAsync(['github.com/org1/repo1'], {
          from: 'user',
        })
      } catch (e) {
        // Expected due to process.exit mock
      }

      // Check config was not changed
      const config = JSON.parse(await fs.readFile(path.join(tempDir, '.ccmm', 'config.json'), 'utf-8'))
      expect(config.defaultPresetRepositories).toContain('github.com/org1/repo1')
      expect(logOutput).toContain('Removal cancelled.')
      
      mockExit.mockRestore()
    })

    it('should prompt for selection if no repository provided', async () => {
      // Mock process.exit to prevent test from exiting
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Process exited')
      })

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

      try {
        await removeCmd?.parseAsync([], { from: 'user' })
      } catch (e) {
        // Expected due to process.exit mock
      }

      // Check config was updated
      const config = JSON.parse(await fs.readFile(path.join(tempDir, '.ccmm', 'config.json'), 'utf-8'))
      expect(config.defaultPresetRepositories).not.toContain(
        'github.com/org2/repo2'
      )
      expect(logOutput).toContain('✓ Removed repository: github.com/org2/repo2')
      
      mockExit.mockRestore()
    })

    it('should handle non-existent repository error', async () => {
      // Create config with repositories
      const ccmmDir = path.join(tempDir, '.ccmm')
      await fs.mkdir(ccmmDir, { recursive: true })
      await fs.writeFile(
        path.join(ccmmDir, 'config.json'),
        JSON.stringify({
          version: '1.0.0',
          defaultPresetRepositories: ['github.com/org2/repo2'],
        })
      )

      const cmd = makeConfigCommand()
      const removeCmd = cmd.commands.find((c) => c.name() === 'remove')

      // Mock process.exit to prevent test from exiting
      const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('process.exit unexpectedly called')
      }) as any)

      try {
        await removeCmd?.parseAsync(['github.com/org1/repo1'], {
          from: 'user',
        })
      } catch (e: any) {
        expect(e.message).toContain('process.exit unexpectedly called')
      }

      expect(mockExit).toHaveBeenCalledWith(1)
      expect(logOutput).toContain('✗ Error: Repository "github.com/org1/repo1" not found in the list.')
      mockExit.mockRestore()
    })

    it('should handle prompting with undefined repository', async () => {
      // Mock selection returning undefined (edge case)
      vi.mocked(inquirer.prompt).mockResolvedValueOnce({
        repository: undefined,
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

      // Mock process.exit to prevent test from exiting
      const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('process.exit unexpectedly called')
      }) as any)

      try {
        await removeCmd?.parseAsync([], { from: 'user' })
      } catch (e: any) {
        expect(e.message).toContain('process.exit unexpectedly called')
      }

      expect(mockExit).toHaveBeenCalledWith(1)
      expect(logOutput).toContain('✗ Error: Repository "undefined" not found in the list.')
      mockExit.mockRestore()
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