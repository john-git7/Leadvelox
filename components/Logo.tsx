import React from 'react';

export function Logo({ className }: { className?: string }) {
  return (
    <div
      className={className}
      style={{
        aspectRatio: '897 / 790', // Intrinsic aspect ratio of the SVG
        WebkitMaskImage: 'url(/logo.svg?v=2)',
        WebkitMaskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        WebkitMaskSize: 'contain',
        maskImage: 'url(/logo.svg?v=2)',
        maskRepeat: 'no-repeat',
        maskPosition: 'center',
        maskSize: 'contain',
        backgroundColor: 'currentColor'
      }}
    />
  );
}
