// Mock for Bull queue library
const Queue = jest.fn().mockImplementation((name, options) => {
  return {
    name,
    options,
    process: jest.fn(),
    add: jest.fn().mockResolvedValue({ id: '123', data: {} }),
    pause: jest.fn().mockResolvedValue(),
    resume: jest.fn().mockResolvedValue(),
    count: jest.fn().mockResolvedValue(0),
    empty: jest.fn().mockResolvedValue(),
    close: jest.fn().mockResolvedValue(),
    clean: jest.fn().mockResolvedValue([]),
    obliterate: jest.fn().mockResolvedValue(),
    on: jest.fn(),
    once: jest.fn(),
    off: jest.fn(),
    removeAllListeners: jest.fn(),
    getJob: jest.fn().mockResolvedValue(null),
    getJobs: jest.fn().mockResolvedValue([]),
    getJobCounts: jest.fn().mockResolvedValue({
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
      paused: 0,
    }),
    getWaiting: jest.fn().mockResolvedValue([]),
    getActive: jest.fn().mockResolvedValue([]),
    getDelayed: jest.fn().mockResolvedValue([]),
    getCompleted: jest.fn().mockResolvedValue([]),
    getFailed: jest.fn().mockResolvedValue([]),
    isPaused: jest.fn().mockResolvedValue(false),
  };
});

module.exports = Queue;
module.exports.default = Queue;