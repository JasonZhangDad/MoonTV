'use client';

import Image, { type ImageProps } from 'next/image';
import React, { useEffect, useState } from 'react';

import { getImageProxyCandidates } from '@/lib/utils';

type ProxyImageProps = Omit<ImageProps, 'src'> & {
  src: string;
};

export const ProxyImage: React.FC<ProxyImageProps> = ({
  src,
  alt,
  ...props
}) => {
  const candidates = getImageProxyCandidates(src);
  const [candidateIndex, setCandidateIndex] = useState(0);

  useEffect(() => {
    setCandidateIndex(0);
  }, [src]);

  if (!candidates.length) {
    return <Image src={src} alt={alt} {...props} />;
  }

  const currentSrc =
    candidates[Math.min(candidateIndex, candidates.length - 1)];

  return (
    <Image
      src={currentSrc}
      alt={alt}
      {...props}
      referrerPolicy='no-referrer'
      onError={(event) => {
        if (candidateIndex + 1 < candidates.length) {
          setCandidateIndex((value) =>
            Math.min(value + 1, candidates.length - 1)
          );
          return;
        }

        props.onError?.(event);
      }}
    />
  );
};
