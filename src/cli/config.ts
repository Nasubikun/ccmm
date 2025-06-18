import { Command } from 'commander'
import chalk from 'chalk'
import { loadConfig, saveConfig, updateConfig } from '../core/config.js'
import { Result, Ok, Err } from '../lib/result.js'
import { showError } from './common.js'
import inquirer from 'inquirer'

export function makeConfigCommand(): Command {
  const cmd = new Command('config')
    .description('Manage ccmm configuration')
    .action(async () => {
      // If no subcommand is specified, show help
      cmd.help()
    })

  // List repositories
  cmd
    .command('list')
    .alias('ls')
    .description('List configured preset repositories')
    .action(async () => {
      const result = await listRepositories()
      if (!result.success) {
        showError(result.error.message)
        process.exit(1)
      }
    })

  // Add repository
  cmd
    .command('add [repository]')
    .description('Add a preset repository (format: github.com/owner/repo)')
    .action(async (repository?: string) => {
      const result = await addRepository(repository)
      if (!result.success) {
        showError(result.error.message)
        process.exit(1)
      }
    })

  // Remove repository
  cmd
    .command('remove [repository]')
    .alias('rm')
    .description('Remove a preset repository')
    .action(async (repository?: string) => {
      const result = await removeRepository(repository)
      if (!result.success) {
        showError(result.error.message)
        process.exit(1)
      }
    })

  return cmd
}

async function listRepositories(): Promise<Result<void>> {
  const configResult = await loadConfig()
  if (!configResult.success) {
    return { success: false, error: configResult.error }
  }

  const config = configResult.data
  const repositories = config.defaultPresetRepositories || []

  if (repositories.length === 0) {
    console.log(chalk.yellow('No preset repositories configured.'))
    console.log(chalk.gray('Use "ccmm config add" to add a repository.'))
    return { success: true, data: undefined }
  }

  console.log(chalk.bold('Configured preset repositories:'))
  repositories.forEach((repo, index) => {
    console.log(chalk.cyan(`  ${index + 1}. ${repo}`))
  })

  return { success: true, data: undefined }
}

async function addRepository(repository?: string): Promise<Result<void>> {
  const configResult = await loadConfig()
  if (!configResult.success) {
    return { success: false, error: configResult.error }
  }

  const config = configResult.data
  const repositories = config.defaultPresetRepositories || []

  // If no repository provided, prompt for it
  if (!repository) {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'repository',
        message: 'Enter the repository URL (e.g., github.com/owner/repo):',
        validate: (input: string) => {
          if (!input.trim()) {
            return 'Repository URL cannot be empty'
          }
          if (!isValidRepositoryFormat(input)) {
            return 'Invalid repository format. Expected: github.com/owner/repo'
          }
          return true
        },
      },
    ])
    repository = answers.repository
  }

  // Validate repository format
  if (!repository || !isValidRepositoryFormat(repository)) {
    return { 
      success: false, 
      error: new Error('Invalid repository format. Expected: github.com/owner/repo')
    }
  }

  // Check if already exists
  if (repositories.includes(repository)) {
    console.log(chalk.yellow(`Repository "${repository}" is already in the list.`))
    return { success: true, data: undefined }
  }

  // Add to list
  repositories.push(repository)
  const updateResult = await updateConfig({
    defaultPresetRepositories: repositories,
  })

  if (!updateResult.success) {
    return { success: false, error: updateResult.error }
  }

  console.log(chalk.green(`✓ Added repository: ${repository}`))
  return { success: true, data: undefined }
}

async function removeRepository(repository?: string): Promise<Result<void>> {
  const configResult = await loadConfig()
  if (!configResult.success) {
    return { success: false, error: configResult.error }
  }

  const config = configResult.data
  const repositories = config.defaultPresetRepositories || []

  if (repositories.length === 0) {
    console.log(chalk.yellow('No repositories to remove.'))
    return { success: true, data: undefined }
  }

  // If no repository provided, show selection list
  if (!repository) {
    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'repository',
        message: 'Select a repository to remove:',
        choices: repositories,
      },
    ])
    repository = answers.repository
  }

  // Check if exists
  const index = repositories.indexOf(repository!)
  if (index === -1) {
    return { 
      success: false, 
      error: new Error(`Repository "${repository}" not found in the list.`)
    }
  }

  // Confirm removal
  const confirmAnswers = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: `Are you sure you want to remove "${repository}"?`,
      default: false,
    },
  ])

  if (!confirmAnswers.confirm) {
    console.log(chalk.gray('Removal cancelled.'))
    return { success: true, data: undefined }
  }

  // Remove from list
  repositories.splice(index, 1)
  const updateResult = await updateConfig({
    defaultPresetRepositories: repositories,
  })

  if (!updateResult.success) {
    return { success: false, error: updateResult.error }
  }

  console.log(chalk.green(`✓ Removed repository: ${repository}`))
  return { success: true, data: undefined }
}

function isValidRepositoryFormat(repository: string): boolean {
  // Expected format: github.com/owner/repo
  const pattern = /^github\.com\/[\w-]+\/[\w-]+$/
  return pattern.test(repository)
}