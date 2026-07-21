# Material UI - Next.js App Router example

This is a [Next.js](https://nextjs.org/) project bootstrapped using [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with Material UI installed.

## How to use

Download the example [or clone the repo](https://github.com/mui/material-ui):

<!-- #default-branch-switch -->

```bash
curl https://codeload.github.com/mui/material-ui/tar.gz/master | tar -xz --strip=2  material-ui-master/examples/material-ui-nextjs
cd material-ui-nextjs
```

Install it and run:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## OIDC BFF browser smoke

The committed Playwright smoke covers login, a protected BFF title request,
optional short-token refresh checks, and logout. It deliberately requires a
deployed test environment and disposable credentials rather than storing any
browser authentication state in the repository:

```bash
KINO_E2E_BASE_URL=http://local.kino.com \
KINO_E2E_USERNAME=... \
KINO_E2E_PASSWORD=... \
npm run test:e2e:oidc
```

Set `KINO_E2E_REFRESH_WAIT_SECONDS` only for an environment configured with a
short BFF access-token lifetime. GitHub Actions provides the same smoke as the
manual **kino OIDC BFF E2E** workflow; configure its `kino-e2e` environment
with a non-sensitive `KINO_E2E_USERNAME` variable and a
`KINO_E2E_PASSWORD` secret.

or:

<!-- #default-branch-switch -->

[![Edit on StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/mui/material-ui/tree/master/examples/material-ui-nextjs)

[![Edit on CodeSandbox](https://codesandbox.io/static/img/play-codesandbox.svg)](https://codesandbox.io/s/github/mui/material-ui/tree/master/examples/material-ui-nextjs)

## Learn more

To learn more about this example:

- [Next.js documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Customizing Material UI](https://mui.com/material-ui/customization/how-to-customize/) - approaches to customizing Material UI.

## What's next?

<!-- #default-branch-switch -->

You now have a working example project.
You can head back to the documentation and continue by browsing the [templates](https://mui.com/material-ui/getting-started/templates/) section.
