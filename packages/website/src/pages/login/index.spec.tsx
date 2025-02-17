import { fireEvent, render, waitFor } from '@testing-library/react';
import { rest } from 'msw';
import React from 'react';
import * as MockReact from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import { UserProvider } from '../../hooks/use-user';
import { server as mockServer } from '../../mocks/server';
import LoginPage from '.';

jest.mock('@marsidev/react-turnstile', () => {
  const Turnstile = MockReact.forwardRef<
    { reset?: () => void },
    { onSuccess?: (token: string) => void }
  >(({ onSuccess }, ref) => {
    MockReact.useImperativeHandle(ref, () => ({ reset: () => undefined }));

    MockReact.useEffect(() => {
      onSuccess?.('fake-token');
    });

    return <div />;
  });

  return { Turnstile };
});

jest.mock('react-router-dom');
const mockedUseNavigate = jest.mocked(useNavigate);
const mockedUseLocation = jest.mocked(useLocation);
const mockedUseSearchParams = jest.mocked(useSearchParams);

function mockLogin(
  statusCode: number,
  response: Object = {},
  headers: Record<string, string | string[]> = {},
): void {
  mockServer.use(
    rest.post('http://localhost/p1/login2', (req, res, ctx) => {
      return res(ctx.status(statusCode), ctx.set(headers), ctx.json(response));
    }),
  );
}

function mockSuccessfulLogin() {
  mockLogin(200);

  const { getByPlaceholderText, getByText } = render(
    <UserProvider>
      <LoginPage />
    </UserProvider>,
  );
  const fakeEmail = 'fake-email';
  const fakePassword = 'fakepassword';

  fireEvent.input(getByPlaceholderText('你的 Email 地址'), { target: { value: fakeEmail } });
  fireEvent.input(getByPlaceholderText('你的登录密码'), { target: { value: fakePassword } });

  fireEvent.click(getByText('登录'));
}

it('should redirect user to homepage after success login', async () => {
  const mockedNavigate = jest.fn();
  mockedUseNavigate.mockReturnValue(mockedNavigate);
  mockedUseLocation.mockReturnValue({ key: 'default' } as any);
  mockedUseSearchParams.mockReturnValue([new URLSearchParams(), jest.fn()] as any);

  mockSuccessfulLogin();
  await waitFor(() => {
    expect(mockedNavigate).toBeCalledWith('/', { replace: true });
  });
});

it('should bring user back to last page if exists', async () => {
  const mockedNavigate = jest.fn();
  mockedUseNavigate.mockReturnValue(mockedNavigate);
  mockedUseLocation.mockReturnValue({ key: 'not-default' } as any);
  mockedUseSearchParams.mockReturnValue([new URLSearchParams(), jest.fn()] as any);

  mockSuccessfulLogin();
  await waitFor(() => {
    expect(mockedNavigate).toBeCalledWith(-1);
  });
});

it('should redirect user to specified page', async () => {
  const mockedNavigate = jest.fn();
  mockedUseNavigate.mockReturnValue(mockedNavigate);
  mockedUseLocation.mockReturnValue({ key: 'default' } as any);
  mockedUseSearchParams.mockReturnValue([
    new URLSearchParams({ backTo: '/group/sandbox' }),
    jest.fn(),
  ] as any);

  mockSuccessfulLogin();
  await waitFor(() => {
    expect(mockedNavigate).toBeCalledWith('/group/sandbox', { replace: true });
  });
});

it('should redirect user to home if specified path is invalid', async () => {
  const mockedNavigate = jest.fn();
  mockedUseNavigate.mockReturnValue(mockedNavigate);
  mockedUseLocation.mockReturnValue({ key: 'default' } as any);
  mockedUseSearchParams.mockReturnValue([
    new URLSearchParams({ backTo: 'https://bgm.tv/' }),
    jest.fn(),
  ] as any);

  mockSuccessfulLogin();
  await waitFor(() => {
    expect(mockedNavigate).toBeCalledWith('/', { replace: true });
  });
});

it.each([
  {
    statusCode: 401,
    resp: { code: 'CAPTCHA_ERROR' },
    headers: { 'X-RateLimit-Remaining': '4' },
    expectedError: '验证码错误，您还有 4 次尝试机会',
  },
  {
    statusCode: 401,
    resp: { code: 'EMAIL_PASSWORD_ERROR' },
    headers: { 'X-RateLimit-Remaining': '4' },
    expectedError: '用户名与密码不正确，请检查后重试，您还有 4 次尝试机会',
  },
  { statusCode: 422, expectedError: '未知错误' },
  { statusCode: 429, expectedError: '登录失败次数太多，请过段时间再重试' },
  { statusCode: 502, expectedError: '未知错误' },
])(
  'should show error message when response is $statusCode',
  async ({ statusCode, resp = {}, headers = {}, expectedError }) => {
    mockLogin(statusCode, resp, headers);
    const { getByPlaceholderText, getByText } = render(
      <UserProvider>
        <LoginPage />
      </UserProvider>,
    );
    const fakeEmail = 'fake-email';
    const fakePassword = 'fakepassword';

    fireEvent.input(getByPlaceholderText('你的 Email 地址'), { target: { value: fakeEmail } });
    fireEvent.input(getByPlaceholderText('你的登录密码'), { target: { value: fakePassword } });

    fireEvent.click(getByText('登录'));

    await waitFor(() => {
      expect(getByText(expectedError)).toBeInTheDocument();
    });
  },
);

it('should validate user input', async () => {
  const { getByPlaceholderText, getByText } = render(
    <UserProvider>
      <LoginPage />
    </UserProvider>,
  );

  fireEvent.click(getByText('登录'));

  await waitFor(() => {
    expect(getByText('请输入 Email 地址'));
  });

  const fakeEmail = 'fake-email';
  fireEvent.input(getByPlaceholderText('你的 Email 地址'), { target: { value: fakeEmail } });

  fireEvent.click(getByText('登录'));

  await waitFor(() => {
    expect(getByText('请输入密码'));
  });
});
