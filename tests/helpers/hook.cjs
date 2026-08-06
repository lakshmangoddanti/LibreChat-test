// QTRACE_PLAYWRIGHT_HELPER
const Module = require('module');
const path = require('path');

const originalResolveFilename = Module._resolveFilename;

const testDirectory = path.resolve(process.cwd(), 'tests');
const helpersDirectory = path.resolve(process.cwd(), 'tests/helpers');
const fixturesPath = path.join(helpersDirectory, 'fixtures.ts');

function isInsideDirectory(filePath, directory) {
  const relativePath = path.relative(directory, filePath);
  return (
    relativePath !== '' &&
    !relativePath.startsWith('..') &&
    !path.isAbsolute(relativePath)
  );
}

Module._resolveFilename = function (request, parent, ...rest) {
  const parentFile = parent?.filename;

  if (!parentFile) {
    return originalResolveFilename.call(this, request, parent, ...rest);
  }

  const normalizedParent = path.resolve(parentFile);
  const isPlaywrightImport = request === '@playwright/test';
  const isTestFile = isInsideDirectory(normalizedParent, testDirectory);
  const isHelperFile =
    normalizedParent === fixturesPath ||
    isInsideDirectory(normalizedParent, helpersDirectory);

  if (isPlaywrightImport && isTestFile && !isHelperFile) {
    return originalResolveFilename.call(this, fixturesPath, parent, ...rest);
  }

  return originalResolveFilename.call(this, request, parent, ...rest);
};
