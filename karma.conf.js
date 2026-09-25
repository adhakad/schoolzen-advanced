// Karma configuration file, see link for more information
// https://karma-runner.github.io/1.0/config/configuration-file.html

module.exports = function (config) {
  config.set({
    basePath: '',
    frameworks: ['jasmine', '@angular-devkit/build-angular'],
    plugins: [
      require('karma-jasmine'),
      require('karma-chrome-launcher'),
      require('karma-jasmine-html-reporter'),
      require('karma-coverage'),
      require('@angular-devkit/build-angular/plugins/karma')
    ],
    client: {
      jasmine: {
        // you can add configuration options for Jasmine here
        // the possible options are listed at https://jasmine.github.io/api/edge/Configuration.html
        // for example, you can disable the random execution with `random: false`
        // or set a specific seed with `seed: 4321`
      },
      clearContext: false // leave Jasmine Spec Runner output visible in browser
    },
    jasmineHtmlReporter: {
      suppressAll: true // removes the duplicated traces
    },
    coverageReporter: {
      dir: require('path').join(__dirname, './coverage/angular-slider'),
      subdir: '.',
      reporters: [
        { type: 'html' },
        { type: 'text-summary' }
      ]
    },
    reporters: ['progress', 'kjhtml'],
    port: 9876,
    colors: true,
    logLevel: config.LOG_INFO,
    autoWatch: true,
    browsers: ['Chrome'],
    // A desktop-sized headless window. The shell's layout is breakpoint-dependent (the
    // sidebar is persistent from 992px and an off-canvas drawer below it), and headless
    // Chrome's default 800x600 window sits on the wrong side of that line — so a layout
    // spec would silently measure the mobile shell. Run with:
    //   ng test --browsers=ChromeHeadlessDesktop
    customLaunchers: {
      ChromeHeadlessDesktop: {
        base: 'ChromeHeadless',
        flags: ['--window-size=1400,900']
      },
      // The other side of the same line, for the off-canvas drawer's own layout contract.
      ChromeHeadlessMobile: {
        base: 'ChromeHeadless',
        flags: ['--window-size=600,900']
      }
    },
    singleRun: false,
    restartOnFileChange: true
  });
};
