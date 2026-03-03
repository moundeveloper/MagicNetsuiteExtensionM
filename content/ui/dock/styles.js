export const DOCK_STYLES = `
  #magic-netsuite-dock {
    display: flex;
    flex-direction: row-reverse;
    align-items: flex-start;
  }
  #magic-netsuite-dock .dock-trigger {
    display: flex;
    flex-direction: column;
  }
  #magic-netsuite-dock .dock-arrow {
    cursor: pointer;
    background-color: #8C9BFF;
    color: white;
    padding: 8px 10px;
    border-top-left-radius: 4px;
    border-bottom-left-radius: 4px;
    text-align: center;
    user-select: none;
    transition: background-color 0.2s;
  }
  #magic-netsuite-dock .dock-arrow:hover {
    background-color: #7a8ae6;
  }
  #magic-netsuite-dock .dock-content {
    background: #f3f4f6;
    border: 1px solid #ccc;
    border-radius: 8px 0 0 8px;
    max-width: 0;
    opacity: 0;
    transition: all 0.3s ease;
    overflow: hidden;
    pointer-events: none;
    white-space: nowrap;
  }
  #magic-netsuite-dock .dock-trigger:hover + .dock-content,
  #magic-netsuite-dock .dock-content:hover {
    max-width: 300px;
    opacity: 1;
    pointer-events: auto;
  }
  #magic-netsuite-dock .dock-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  #magic-netsuite-dock .dock-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    gap: 16px;
    border-bottom: 1px solid #e5e7eb;
    min-width: 180px;
  }
  #magic-netsuite-dock .dock-item:last-child {
    border-bottom: none;
  }
  #magic-netsuite-dock .dock-label {
    font-size: 14px;
    color: #374151;
    white-space: nowrap;
  }
  .my-ext-switch { 
    position: relative; 
    display: inline-block; 
    width: 46px; 
    height: 26px;
    flex-shrink: 0;
  }
  .my-ext-switch input { opacity: 0; width: 0; height: 0; }
  .slider {
    position: absolute; 
    cursor: pointer; 
    inset: 0; 
    background-color: #ccc;
    transition: 0.25s; 
    border-radius: 26px;
  }
  .slider:before {
    position: absolute; 
    content: ""; 
    height: 20px; 
    width: 20px; 
    left: 3px; 
    bottom: 3px;
    background-color: white; 
    transition: 0.25s; 
    border-radius: 50%;
  }
  input:checked + .slider { background-color: #8C9BFF; }
  input:checked + .slider:before { transform: translateX(20px); }
`;
