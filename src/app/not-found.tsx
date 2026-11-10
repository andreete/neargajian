import Link from 'next/link';

export default function NotFound() {
  return (
    <main id="main" className="status-page">
      <div>
        <div className="code">404</div>
        <h1>Page not found</h1>
        <p>The page doesn&apos;t exist, or you don&apos;t have access to it.</p>
        <Link className="btn btn-primary" href="/">Back to SentFund</Link>
      </div>
    </main>
  );
}
