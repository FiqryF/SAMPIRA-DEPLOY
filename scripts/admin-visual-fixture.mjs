import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

export async function captureAdmin(send, js, name) {
    const output = process.env.SAMPIRA_ADMIN_SCREENSHOTS;
    if (!output) return;
    mkdirSync(output, {recursive:true});
    await js('window.scrollTo(0, 0); new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    const {data} = await send('Page.captureScreenshot', {format:'png'});
    writeFileSync(join(output, name + '.png'), Buffer.from(data, 'base64'));
}
