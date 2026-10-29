# Runtime and test dependencies

The V1 application uses Node.js standard modules only. Node.js is an independently installed runtime and is not redistributed in the source delivery ZIP. Official runtime/license information: https://nodejs.org/ and https://github.com/nodejs/node/blob/v24.22.1/LICENSE .

Playwright 1.62.1 is an optional development/test dependency under Apache-2.0; its installed package contains its license. It is not required to launch the application and is not bundled in the source ZIP. Reference: https://github.com/microsoft/playwright/tree/v1.62.1 . Browser executables are not redistributed; this Windows verification used an already-installed Microsoft Edge in a new temporary test profile.

No customer records, private databases, initial production passwords, browser profiles or third-party installer are included in the delivery package.
