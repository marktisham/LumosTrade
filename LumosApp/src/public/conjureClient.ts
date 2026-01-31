// Client-side TypeScript for Conjure page

// Types
interface VizData {
    kind: 'line' | 'bar' | 'bubble' | 'pie' | 'table' | 'column' | 'text';
    title?: string;
    message?: string;
    labels?: {
        x?: string;
        y?: string;
        z?: string;
    };
    series?: Array<{
        name: string;
        color?: string;
        data: Array<{
            name?: string;
            x?: any;
            y?: number;
            z?: number;
        }>;
    }>;
}

document.addEventListener('DOMContentLoaded', () => {
    // Access Highcharts from window object (loaded via CDN)
    const Highcharts = (window as any).Highcharts;
    // UI Elements
    const conjureInput = document.getElementById('conjureInput') as HTMLTextAreaElement;
    const submitBtn = document.getElementById('conjureSubmitBtn') as HTMLButtonElement;
    const stopBtn = document.getElementById('conjureStopBtn') as HTMLButtonElement;
    const canvas = document.getElementById('conjureCanvas') as HTMLElement;
    const errorDiv = document.getElementById('conjureError') as HTMLElement;
    const clearBtn = document.createElement('button');

    // Session Management
    const SESSION_COOKIE = 'LumosConjureSession';
    const SESSION_EXPIRY_DAYS = 1;

    let currentController: AbortController | null = null;
    let lastPrompt: string = '';

    // =========================================================================
    // Initialization
    // =========================================================================
    initClearButton();
    checkSession();
    if (canvas) {
        canvas.style.maxHeight = '88vh';
        canvas.style.overflowY = 'auto';
    }

    // =========================================================================
    // Event Listeners
    // =========================================================================
    submitBtn.addEventListener('click', handleSubmit);
    stopBtn.addEventListener('click', handleStop);
    
    // Allow Enter key to submit (Shift+Enter for new line)
    conjureInput.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    });

    // =========================================================================
    // Core Functions
    // =========================================================================

    function initClearButton(): void {
        const header = document.querySelector('.conjure-header');
        if (header) {
            const btnContainer = document.createElement('div');
            btnContainer.className = 'float-end';
            
            clearBtn.className = 'btn btn-outline-secondary btn-sm';
            clearBtn.innerHTML = '<i class="fa-solid fa-rotate-right me-1"></i> New Session';
            clearBtn.onclick = handleClearSession;
            
            btnContainer.appendChild(clearBtn);
            header.insertBefore(btnContainer, header.firstChild);
        }
    }

    async function handleSubmit(): Promise<void> {
        const prompt = conjureInput.value.trim();
        if (!prompt) return;

        lastPrompt = prompt;
        
        // Reset UI
        errorDiv.style.display = 'none';
        
        // Show loading state
        setLoading(true);
        showCanvasStatus('Lumos Conjure agent processing...');

        try {
            const sessionId = getSessionId() || createSessionId();
            const isNew = !getSessionId();

            if (isNew) {
                setSessionId(sessionId);
            }

            currentController = new AbortController();
            const signal = currentController.signal;

            const response = await fetch('/request/conjure', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    prompt, 
                    sessionId, 
                    isNewSession: isNew 
                }),
                signal
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Request failed');
            }

            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.error || 'Unknown error');
            }

            finalizeVisualization(data.text);

        } catch (err: any) {
            if (err.name === 'AbortError') {
                console.log('Request aborted');
            } else {
                showError('Failed to process request: ' + err.message);
                conjureInput.value = prompt;
            }
            setLoading(false);
        }
    }

    function handleStop(): void {
        if (currentController) {
            currentController.abort();
            currentController = null;
            setLoading(false);
            hideCanvasStatus();
            showError('Action stopped by user.');
        }
    }

    function handleClearSession(): void {
        document.cookie = `${SESSION_COOKIE}=; Max-Age=0; path=/;`;
        conjureInput.value = '';
        lastPrompt = '';
        errorDiv.style.display = 'none';
        hideCanvasStatus();
        canvas.style.display = 'block';
        canvas.innerHTML = `
            <div class="conjure-placeholder">
                <i class="fa-solid fa-wand-magic-sparkles fa-3x text-muted mb-3"></i>
                <p class="text-muted">Enter a prompt below to visualize data</p>
            </div>`;
        const newId = createSessionId();
        setSessionId(newId);
    }

    // =========================================================================
    // Render Logic
    // =========================================================================
    function showCopyNotification(): void {
        const toast = document.createElement('div');
        toast.className = 'position-fixed top-0 start-50 translate-middle-x p-3';
        toast.style.zIndex = '9999';
        toast.style.marginTop = '20px';
        toast.innerHTML = `
            <div class="toast show" role="alert">
                <div class="toast-body bg-secondary text-white rounded">
                    <i class="fa-solid fa-copy me-2"></i>Copied to clipboard
                </div>
            </div>
        `;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, 1000);
    }

    let statusContainer: HTMLElement | null = null;

    function getStatusContainer(): HTMLElement {
        if (statusContainer) return statusContainer;
        statusContainer = document.createElement('div');
        statusContainer.id = 'conjureStatus';
        statusContainer.style.margin = '0.125rem 0';
        statusContainer.style.padding = '0.125rem 0';
        statusContainer.style.textAlign = 'left';
        statusContainer.style.color = '#9ca3af';
        statusContainer.style.fontSize = '0.875rem';
        statusContainer.style.display = 'none';
        const inputContainer = document.querySelector('.conjure-input-container');
        if (inputContainer && inputContainer.parentElement) {
            inputContainer.parentElement.insertBefore(statusContainer, inputContainer.nextSibling);
        }
        return statusContainer;
    }

    function showCanvasStatus(message: string): void {
        const status = getStatusContainer();
        status.style.display = 'block';
        status.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: flex-start; gap: 0.5rem; line-height: 1; padding-left: 0.25rem;">
                <i class="fa-solid fa-spinner fa-spin"></i>
                <span>${message}</span>
            </div>`;
    }

    function hideCanvasStatus(): void {
        const status = getStatusContainer();
        status.style.display = 'none';
        status.innerHTML = '';
    }

    function showPromptInStatus(prompt: string): void {
        const status = getStatusContainer();
        status.style.display = 'block';
        status.innerHTML = '';

        const promptDiv = document.createElement('div');
        promptDiv.style.display = 'flex';
        promptDiv.style.alignItems = 'center';
        promptDiv.style.gap = '0.5rem';
        promptDiv.style.fontSize = '0.85rem';
        promptDiv.style.color = '#6c757d';
        promptDiv.style.fontStyle = 'italic';
        promptDiv.style.paddingLeft = '0.25rem';

        const promptText = document.createElement('span');
        promptText.textContent = prompt;
        promptDiv.appendChild(promptText);

        const copyIcon = document.createElement('i');
        copyIcon.className = 'fa-solid fa-copy';
        copyIcon.style.cursor = 'pointer';
        copyIcon.style.padding = '0.25rem';
        copyIcon.title = 'Copy prompt';
        copyIcon.onclick = () => {
            navigator.clipboard.writeText(prompt).then(() => {
                showCopyNotification();
            });
        };
        promptDiv.appendChild(copyIcon);

        status.appendChild(promptDiv);
    }

    function finalizeVisualization(responseText: string): void {
        setLoading(false);
        try {
            console.log('[conjure] Finalizing visualization');
            console.log('[conjure] Response text length:', responseText.length);
            
            if (!responseText || responseText.trim().length === 0) {
                throw new Error('No response data received from agent');
            }
            
            let jsonStr = responseText;
            const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/;
            const markdownMatch = jsonStr.match(codeBlockRegex);
            
            if (markdownMatch && markdownMatch[1]) {
                jsonStr = markdownMatch[1];
                console.log('[conjure] Extracted from markdown code block');
            } else {
                const firstBrace = jsonStr.indexOf('{');
                const end = jsonStr.lastIndexOf('}');
                
                if (firstBrace !== -1 && end !== -1 && end > firstBrace) {
                    jsonStr = jsonStr.substring(firstBrace, end + 1);
                    console.log('[conjure] Extracted JSON between braces');
                }
            }
            
            // Try to fix truncated JSON (missing closing brackets)
            const openBraces = (jsonStr.match(/\{/g) || []).length;
            const closeBraces = (jsonStr.match(/\}/g) || []).length;
            const openBrackets = (jsonStr.match(/\[/g) || []).length;
            const closeBrackets = (jsonStr.match(/\]/g) || []).length;
            
            if (openBraces > closeBraces || openBrackets > closeBrackets) {
                console.warn('[conjure] JSON appears truncated, attempting to fix...');
                const missingBrackets = openBrackets - closeBrackets;
                const missingBraces = openBraces - closeBraces;
                
                for (let i = 0; i < missingBrackets; i++) {
                    jsonStr += ']';
                }
                for (let i = 0; i < missingBraces; i++) {
                    jsonStr += '}';
                }
                console.log('[conjure] Added missing brackets:', { missingBrackets, missingBraces });
            }
            
            console.log('[conjure] JSON to parse (length:', jsonStr.length, ')');
            console.log('[conjure] JSON content:', jsonStr);

            const data: VizData = JSON.parse(jsonStr);

            if (!data.kind) {
                 throw new Error("Invalid response format: Missing 'kind'");
            }

            renderContent(data);

        } catch (e: any) {
            console.error('[conjure] Parse Error:', e);
            console.error('[conjure] Raw response text:', responseText);
            canvas.style.display = 'none';
            hideCanvasStatus();
            showError(`Failed to parse JSON: ${e.message}\n\nRaw Output:\n${responseText}`);
        }
    }

    function renderContent(data: VizData): void {
        if (data.kind === 'text') {
            const container = document.createElement('div');
            container.style.display = 'flex';
            container.style.flexDirection = 'column';
            container.style.gap = '0.75rem';

            const textWindow = document.createElement('div');
            textWindow.style.background = '#2d2d2d';
            textWindow.style.border = '1px solid #454545';
            textWindow.style.borderRadius = '0.75rem';
            textWindow.style.padding = '1rem 1.25rem';
            textWindow.style.color = '#e8e8e8';
            textWindow.style.textAlign = 'left';
            textWindow.style.lineHeight = '1.6';
            textWindow.style.whiteSpace = 'pre-wrap';

            const text = document.createElement('div');
            text.innerText = data.message || '';
            textWindow.appendChild(text);

            container.appendChild(textWindow);

            canvas.style.display = 'block';
            canvas.innerHTML = '';
            canvas.appendChild(container);
            conjureInput.value = '';
            hideCanvasStatus();
            return;
        }

        showCanvasStatus(data.kind === 'table' ? 'Rendering table...' : 'Rendering chart...');

        setTimeout(() => {
            try {
                const staging = document.createElement('div');
                staging.style.position = 'absolute';
                staging.style.left = '-10000px';
                staging.style.top = '0';
                staging.style.width = `${canvas.clientWidth || canvas.parentElement?.clientWidth || 800}px`;
                staging.style.visibility = 'hidden';
                staging.style.pointerEvents = 'none';

                canvas.appendChild(staging);

                const infoDiv = document.createElement('div');
                infoDiv.className = 'mb-3 conjure-info';

                if (data.title) {
                    const h4 = document.createElement('h4');
                    h4.innerText = data.title;
                    infoDiv.appendChild(h4);
                }
                if (data.message) {
                    const p = document.createElement('p');
                    p.className = 'text-muted';
                    p.innerText = data.message;
                    infoDiv.appendChild(p);
                }
                staging.appendChild(infoDiv);

                const chartDiv = document.createElement('div');
                chartDiv.id = 'viz-container-' + Date.now();
                chartDiv.style.width = '100%';
                chartDiv.style.height = '275px';
                chartDiv.style.minHeight = '275px';
                staging.appendChild(chartDiv);

                if (data.kind === 'table') {
                    renderTable(data, chartDiv);
                } else if (['line', 'bar', 'bubble', 'pie', 'column'].includes(data.kind)) {
                    renderChart(data, chartDiv);
                } else {
                    chartDiv.innerHTML = `<pre class="bg-light p-3 border rounded">${data.message || JSON.stringify(data, null, 2)}</pre>`;
                }

                canvas.style.display = 'block';
                conjureInput.value = '';

                const toRemove = Array.from(canvas.children).filter(child => child !== staging);
                toRemove.forEach(child => child.remove());

                staging.style.position = 'static';
                staging.style.left = '';
                staging.style.top = '';
                staging.style.width = '100%';
                staging.style.visibility = 'visible';
                staging.style.pointerEvents = 'auto';

                if (lastPrompt) {
                    showPromptInStatus(lastPrompt);
                } else {
                    hideCanvasStatus();
                }
            } catch (err) {
                console.error('[conjure] Render Error:', err);
                hideCanvasStatus();
                showError('Failed to render visualization.');
            }
        }, 100);
    }

    function isDateString(value: any): boolean {
        if (typeof value !== 'string') return false;
        // Check for ISO date format or common date patterns
        const datePattern = /^\d{4}-\d{2}-\d{2}|^\d{2}\/\d{2}\/\d{4}|^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
        return datePattern.test(value) && !isNaN(Date.parse(value));
    }

    function formatDate(value: string): string {
        const date = new Date(value);
        return new Intl.DateTimeFormat('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'America/New_York'
        }).format(date);
    }

    function getColumnType(columnData: any[]): 'number' | 'date' | 'text' {
        const samples = columnData.filter(v => v !== undefined && v !== null).slice(0, 10);
        if (samples.length === 0) return 'text';
        
        const allNumbers = samples.every(v => typeof v === 'number');
        if (allNumbers) return 'number';
        
        const allDates = samples.every(v => isDateString(v));
        if (allDates) return 'date';
        
        return 'text';
    }

    function renderTable(data: VizData, container: HTMLElement): void {
        const table = document.createElement('table');
        table.className = 'lumos-dark-table';
        
        const thead = document.createElement('thead');
        const trHead = document.createElement('tr');
        
        let cols = ['Key'];
        if (data.labels && data.labels.x) cols[0] = data.labels.x;
        
        if (data.series) {
            data.series.forEach(s => cols.push(s.name));
        }
        
        // Build row map first to determine column types
        const rowMap = new Map<string, any>();
        
        if (data.series) {
            data.series.forEach((s) => {
                s.data.forEach(d => {
                    const key = d.name || d.x || 'Row ' + rowMap.size;
                    if (!rowMap.has(key)) {
                        rowMap.set(key, { keyVal: key });
                    }
                    const row = rowMap.get(key);
                    row[s.name] = d.y; 
                });
            });
        }

        // Determine column types
        const columnTypes: { [key: string]: 'number' | 'date' | 'text' } = {};
        
        // Check first column (key column)
        const firstColValues = Array.from(rowMap.values()).map(r => r.keyVal);
        columnTypes[cols[0]] = getColumnType(firstColValues);
        
        // Check other columns
        if (data.series) {
            data.series.forEach(s => {
                const colValues = Array.from(rowMap.values()).map(r => r[s.name]);
                columnTypes[s.name] = getColumnType(colValues);
            });
        }
        
        // Render headers with appropriate alignment
        cols.forEach((c) => {
            const th = document.createElement('th');
            th.innerText = c;
            const colType = columnTypes[c] || 'text';
            th.className = colType === 'number' ? 'c' : 'l';
            trHead.appendChild(th);
        });
        thead.appendChild(trHead);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');

        rowMap.forEach((rowObj) => {
            const tr = document.createElement('tr');
            
            const tdKey = document.createElement('td');
            const keyType = columnTypes[cols[0]] || 'text';
            tdKey.classList.add(keyType === 'number' ? 'c' : 'l');
            
            const keyVal = rowObj.keyVal;
            if (keyType === 'date' && isDateString(keyVal)) {
                tdKey.innerText = formatDate(keyVal);
            } else {
                tdKey.innerText = keyVal;
            }
            tr.appendChild(tdKey);
            
            if (data.series) {
                data.series.forEach(s => {
                    const td = document.createElement('td');
                    const val = rowObj[s.name];
                    const colType = columnTypes[s.name] || 'text';
                    
                    if (val !== undefined && val !== null) {
                        if (colType === 'number' && typeof val === 'number') {
                            td.innerText = val.toLocaleString();
                            td.classList.add('c');
                            if (val > 0) td.classList.add('p');
                            if (val < 0) td.classList.add('n');
                        } else if (colType === 'date' && isDateString(val)) {
                            td.innerText = formatDate(val);
                            td.classList.add('l');
                        } else {
                            td.innerText = String(val);
                            td.classList.add('l');
                        }
                    } else {
                        td.innerText = '-';
                        td.classList.add(colType === 'number' ? 'c' : 'l'); 
                    }
                    tr.appendChild(td);
                });
            }
            tbody.appendChild(tr);
        });
        
        table.appendChild(tbody);
        container.appendChild(table);
    }

    const currencyFormatter = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });

    const formatCurrency = (value: number | undefined | null): string => {
        if (value === null || value === undefined || Number.isNaN(value)) return '—';
        return currencyFormatter.format(value);
    };

    function renderChart(data: VizData, container: HTMLElement): void {
        // If only one series and no y-axis label, use the series name as y-axis label
        const yAxisLabel = data.labels?.y || (data.series?.length === 1 ? data.series[0].name : undefined);

        const tooltipOptions: any = {
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            style: {
                color: '#e8e8e8'
            },
            borderColor: '#666'
        };

        if (data.kind === 'bubble') {
            tooltipOptions.useHTML = true;
            tooltipOptions.formatter = function(this: any): string {
                const symbol = (this.series && this.series.name) ? this.series.name : '';
                const currentGain = this.point ? this.point.y : null;
                const currentValue = this.point ? this.point.z : null;
                return [
                    `<div><strong>${symbol}</strong></div>`,
                    `<div>Current Value: ${formatCurrency(currentValue)}</div>`,
                    `<div>Current Gain: ${formatCurrency(currentGain)}</div>`
                ].join('');
            };
        }
        
        Highcharts.chart(container.id, {
            chart: {
                type: data.kind,
                zoomType: 'xy',
                backgroundColor: 'transparent'
            },
            title: { 
                text: null 
            },
            xAxis: {
                title: { 
                    text: data.labels?.x,
                    style: { color: '#c8c8c8' }
                },
                type: (data.kind === 'bar') ? 'category' : 'datetime',
                labels: {
                    format: '{value:%b %e, %Y}',
                    style: { color: '#c8c8c8' }
                },
                tickInterval: undefined // Let Highcharts auto-calculate spacing
            },
            yAxis: {
                title: { 
                    text: yAxisLabel,
                    style: { color: '#c8c8c8' }
                },
                gridLineColor: 'rgba(255,255,255,0.06)',
                labels: {
                    style: { color: '#c8c8c8' }
                }
            },
            zAxis: {
                 title: { 
                     text: data.labels?.z,
                     style: { color: '#c8c8c8' }
                 }
            },
            plotOptions: {
                column: {
                    maxPointWidth: 30, // Limit column width for skinnier bars
                    pointPadding: 0.1,
                    groupPadding: 0.15
                },
                pie: {
                    dataLabels: {
                        enabled: true,
                        style: {
                            color: '#c8c8c8',
                            textOutline: 'none'
                        }
                    }
                }
            },
            legend: {
                enabled: (data.series?.length || 0) > 1, // Only show legend if multiple series
                itemStyle: { color: '#c8c8c8' },
                itemHoverStyle: { color: '#ffffff' }
            },
            tooltip: tooltipOptions,
            credits: {
                enabled: false
            },
            exporting: {
                enabled: false
            },
            series: data.series?.map(s => {
                // Set default color for gain-related series to green (matches positive bars)
                const isGainSeries = data.kind === 'column' && s.name.toLowerCase().includes('gain');
                const seriesColor = isGainSeries && !s.color ? '#28a745' : s.color;
                
                return {
                    name: s.name,
                    color: seriesColor,
                    marker: {
                        lineColor: null,
                        lineWidth: 1
                    },
                    data: s.data.map(d => {
                         if (data.kind === 'bubble') return { x: d.x, y: d.y, z: d.z, name: d.name };
                         if (data.kind === 'pie') return { name: d.name, y: d.y };
                         // Convert date strings to timestamps for line/column charts
                         if ((data.kind === 'line' || data.kind === 'column') && typeof d.x === 'string') {
                             const point: any = { x: Date.parse(d.x), y: d.y, name: d.name };
                             // Color-code column charts showing gains/losses
                             if (isGainSeries && d.y !== undefined) {
                                 point.color = d.y >= 0 ? '#28a745' : '#dc3545'; // green for gains, red for losses
                             }
                             return point;
                         }
                         return { x: d.x, y: d.y, name: d.name };
                    })
                };
            })
        });
    }

    // =========================================================================
    // Session Utils
    // =========================================================================
    function getSessionId(): string | null {
        return getCookie(SESSION_COOKIE);
    }
    
    function setSessionId(id: string): void {
        setCookie(SESSION_COOKIE, id, SESSION_EXPIRY_DAYS);
    }
    
    function createSessionId(): string {
        return 'conjure-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    }

    function getCookie(name: string): string | null {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) {
            const part = parts.pop();
            return part ? part.split(';').shift() || null : null;
        }
        return null;
    }

    function setCookie(name: string, value: string, days: number): void {
        const d = new Date();
        d.setTime(d.getTime() + (days*24*60*60*1000));
        const expires = "expires="+ d.toUTCString();
        document.cookie = name + "=" + value + ";" + expires + ";path=/";
    }
    
    function checkSession(): void {
        setSessionId(createSessionId());
    }

    function setLoading(isLoading: boolean): void {
        if (isLoading) {
            submitBtn.style.display = 'none';
            stopBtn.style.display = 'inline-block';
            conjureInput.disabled = true;
            conjureInput.style.color = '#6c757d';
        } else {
            submitBtn.style.display = 'inline-block';
            stopBtn.style.display = 'none';
            conjureInput.disabled = false;
            conjureInput.style.color = '#ffffff';
            conjureInput.focus();
        }
    }
    
    function showError(msg: string): void {
        errorDiv.innerText = msg;
        errorDiv.style.display = 'block';
        hideCanvasStatus();
    }
});
