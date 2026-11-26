// Runs once when the server starts. In production, refuse to start without the settings the app cannot work without,
// so a misconfigured deployment fails at boot with a clear message instead of on a visitor's first click.
export function register() {
    if (process.env.NODE_ENV !== 'production') return;
    const missing: string[] = [];
    if (!process.env.DATABASE_URL) missing.push('DATABASE_URL');
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) missing.push('JWT_SECRET (32+ characters)');
    if (missing.length) throw new Error(`SDG Nexus cannot start. Set these environment variables: ${missing.join(', ')}`);
}
