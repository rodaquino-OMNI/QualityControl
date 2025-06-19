declare module 'react-csv' {
  import * as React from 'react';

  export interface LabelKeyObject {
    label: string;
    key: string;
  }

  export type Data = any[];
  export type Headers = LabelKeyObject[] | string[];

  interface CSVLinkProps {
    data: string | Data;
    headers?: Headers;
    enclosingCharacter?: string;
    separator?: string;
    filename?: string;
    uFEFF?: boolean;
    onClick?: (event?: React.MouseEvent<HTMLAnchorElement>) => void | boolean;
    asyncOnClick?: boolean;
    target?: string;
    className?: string;
    children?: React.ReactNode;
  }

  export class CSVLink extends React.Component<CSVLinkProps> {}
  export class CSVDownload extends React.Component<CSVLinkProps> {}
}