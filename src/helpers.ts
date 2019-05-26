
export function getLocationHash(): { [key: string]: string } {
    return window.location.hash.slice(2)
        .split('&')
        .filter(a => a)
        .map(a => a.split("="))
        .reduce((a, b) => { a[b[0]] = b[1]; return a; }, Object.create(null));
}

export function updateLocationHash(obj: { [key: string]: string }) {
    let hash = Object.assign(getLocationHash(), obj);
    window.location.hash = `#?${Object.keys(hash).map(k => `${k}=${hash[k]}`).join('&')}`;
}