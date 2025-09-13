export type KGNode = {
  radius: number;
    id: string;
    title: string;
    summary?: string;
    level?: number;
    expanded?: boolean;
    x?: number; y?: number; fx?: number; fy?: number;
    cluster_id?: number;
    color?: string;
    degree?: number;
    label?: string;
  };
  
  export type KGLink = {
    id: string;
    source: string; // node id
    target: string; // node id
    weight?: number;
    kind?: string;
  };
  
  export type GraphData = {
    nodes: KGNode[];
    links: KGLink[];
  };
  
  export type Mode = 'default' | 'connect' | 'add';  