export class Renderer {
    static render(output: any): string {
        // 1. Handle String Output (Legacy/Chat)
        if (typeof output === 'string') return output;

        // 2. Handle Data-Only Constraint
        if (output.constraints?.data_only || output.constraints?.strict_output) {
            if (output.data) {
                // If data is array/object, stringify it nicely
                if (typeof output.data === 'object') {
                    return JSON.stringify(output.data, null, 2);
                }
                return String(output.data);
            }
            // If no data but response exists, return response (fallback)
            return output.response || '';
        }

        // 3. Standard WhatsApp Formatting
        let text = output.response || '';

        // Append data if relevant and not already in text
        // (This is a design choice: usually response covers it, but for debug we might want data)
        // For now, we trust 'response' contains the friendly message.

        return text;
    }
}
