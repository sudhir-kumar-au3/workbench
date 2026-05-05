module.exports = {
  test: {
    include: ['tests/**/*.test.js'],
    testTimeout: 15000,
    hookTimeout: 15000,
    // Tests in this suite spin up real temporary git repos. Running test files in
    // parallel races on macOS APFS occasionally (`fatal: .git/index ... Not a directory`).
    // Serializing files avoids the race; tests within a file still run sequentially.
    fileParallelism: false,
  },
};
