#!/usr/bin/env node

/**
 * TypeScript Configuration Validator
 * Validates and reports on TypeScript configurations across the project
 */

const fs = require('fs');
const path = require('path');

const COLORS = {
  RED: '\x1b[31m',
  GREEN: '\x1b[32m',
  YELLOW: '\x1b[33m',
  BLUE: '\x1b[34m',
  RESET: '\x1b[0m'
};

function log(message, color = COLORS.RESET) {
  console.log(`${color}${message}${COLORS.RESET}`);
}

function checkFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return { exists: false };
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const config = JSON.parse(content);
    return { exists: true, valid: true, config };
  } catch (error) {
    return { exists: true, valid: false, error: error.message };
  }
}

function validateTsConfig(configPath, configName) {
  log(`\nValidating ${configName}...`, COLORS.BLUE);
  
  const result = checkFile(configPath);
  
  if (!result.exists) {
    log(`  ✗ File not found: ${configPath}`, COLORS.RED);
    return false;
  }
  
  if (!result.valid) {
    log(`  ✗ Invalid JSON: ${result.error}`, COLORS.RED);
    return false;
  }
  
  const config = result.config;
  const warnings = [];
  const errors = [];
  
  // Check compiler options
  if (!config.compilerOptions) {
    errors.push('Missing compilerOptions');
  } else {
    const opts = config.compilerOptions;
    
    // Check target
    if (!opts.target) {
      warnings.push('No target specified');
    } else if (!['ES2020', 'ES2021', 'ES2022', 'ESNext'].includes(opts.target)) {
      warnings.push(`Target ${opts.target} might be outdated`);
    }
    
    // Check module resolution
    if (!opts.moduleResolution) {
      warnings.push('No moduleResolution specified');
    }
    
    // Check strict mode
    if (opts.strict === false) {
      warnings.push('Strict mode is disabled');
    }
    
    // Check for conflicting options
    if (opts.noEmit && opts.composite) {
      errors.push('noEmit and composite cannot both be true');
    }
    
    // Check for recommended options
    if (opts.skipLibCheck !== true) {
      warnings.push('Consider enabling skipLibCheck for faster builds');
    }
    
    if (opts.esModuleInterop !== true) {
      warnings.push('Consider enabling esModuleInterop for better compatibility');
    }
  }
  
  // Check includes/excludes
  if (!config.include || config.include.length === 0) {
    warnings.push('No include patterns specified');
  }
  
  if (!config.exclude || config.exclude.length === 0) {
    warnings.push('No exclude patterns specified');
  } else if (!config.exclude.includes('node_modules')) {
    warnings.push('node_modules should be excluded');
  }
  
  // Report results
  if (errors.length > 0) {
    log(`  ✗ Errors:`, COLORS.RED);
    errors.forEach(err => log(`    - ${err}`, COLORS.RED));
  }
  
  if (warnings.length > 0) {
    log(`  ⚠ Warnings:`, COLORS.YELLOW);
    warnings.forEach(warn => log(`    - ${warn}`, COLORS.YELLOW));
  }
  
  if (errors.length === 0 && warnings.length === 0) {
    log(`  ✓ Configuration is valid`, COLORS.GREEN);
  }
  
  return errors.length === 0;
}

function validateJestConfig(configPath, configName) {
  log(`\nValidating ${configName}...`, COLORS.BLUE);
  
  const result = checkFile(configPath);
  
  if (!result.exists) {
    log(`  ✗ File not found: ${configPath}`, COLORS.RED);
    return false;
  }
  
  // For Jest configs in JS format, we can't parse them easily
  // Just check if they exist
  log(`  ✓ File exists`, COLORS.GREEN);
  return true;
}

function main() {
  log('TypeScript Configuration Validator', COLORS.BLUE);
  log('==================================', COLORS.BLUE);
  
  const projectRoot = path.resolve(__dirname, '..');
  let allValid = true;
  
  // Validate TypeScript configs
  const tsConfigs = [
    { path: path.join(projectRoot, 'tsconfig.json'), name: 'Root tsconfig.json' },
    { path: path.join(projectRoot, 'tsconfig.node.json'), name: 'Node tsconfig.json' },
    { path: path.join(projectRoot, 'backend', 'tsconfig.json'), name: 'Backend tsconfig.json' },
    { path: path.join(projectRoot, 'backend', 'tsconfig.build.json'), name: 'Backend build tsconfig.json' },
    { path: path.join(projectRoot, 'frontend', 'tsconfig.json'), name: 'Frontend tsconfig.json' },
    { path: path.join(projectRoot, 'frontend', 'tsconfig.node.json'), name: 'Frontend node tsconfig.json' }
  ];
  
  tsConfigs.forEach(({ path, name }) => {
    if (!validateTsConfig(path, name)) {
      allValid = false;
    }
  });
  
  // Validate Jest configs
  const jestConfigs = [
    { path: path.join(projectRoot, 'jest.config.js'), name: 'Root jest.config.js' },
    { path: path.join(projectRoot, 'jest.integration.config.js'), name: 'Integration jest.config.js' },
    { path: path.join(projectRoot, 'backend', 'jest.config.js'), name: 'Backend jest.config.js' }
  ];
  
  jestConfigs.forEach(({ path, name }) => {
    if (!validateJestConfig(path, name)) {
      allValid = false;
    }
  });
  
  // Summary
  log('\n' + '='.repeat(50), COLORS.BLUE);
  if (allValid) {
    log('✓ All configurations are valid!', COLORS.GREEN);
  } else {
    log('✗ Some configurations have issues', COLORS.RED);
    process.exit(1);
  }
}

// Run the validator
main();