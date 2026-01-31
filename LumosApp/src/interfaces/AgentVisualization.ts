/**
 * Unified Visualization Response
 * A single format for all 2D/3D charts and tables.
 */
export interface VisualizationResponse {
    // Metadata for rendering
    // 'text' is added to support simple text responses or errors
    kind: 'line' | 'bar' | 'bubble' | 'pie' | 'table' | 'text';
    title: string;
    
    // Optional message from the agent to the user providing context
    message?: string;

    // Optional axis labels (used as column headers for tables)
    labels?: {
      x?: string; // label for x-axis or first column
      y?: string; // label for y-axis
      z?: string; // label for z-axis (bubble size)
    };
  
    // The Data (Standard Highcharts Series structure)
    series: {
      name: string;      // Series Label (Legend entry)
      color?: string;    // Optional override
      data: DataPoint[]; // The actual data points
    }[];
  }
  
  /**
   * Universal Data Point
   * Handles 2D (x,y), 3D (x,y,z), and Named points.
   */
  export interface DataPoint {
    name?: string;       // Key Name (e.g., "Apple Inc." or "Q1")
    x?: number | string; // Dimension 1: Value, Time, or Category
    y: number;           // Dimension 2: Primary Value (Height/Length)
    z?: number;          // Dimension 3: Size/Depth (for Bubble charts)
  }
