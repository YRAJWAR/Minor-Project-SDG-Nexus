import React from 'react';

// The sidebar already carries the university name, the user and navigation, so pages render directly.
export default function HEILayout({ children }: { children: React.ReactNode }) {
    return <div className="space-y-6">{children}</div>;
}
