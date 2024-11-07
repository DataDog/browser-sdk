interface Boundaries {
    beg: number;
    end: number;
}


const BegCharClass = '_[['
const EndCharClass = ']]_'


function findNextCharClass(
    pattern: string,
    pos: number
): Boundaries | undefined {
    if (pos >= pattern.length) {
        return undefined;
    }
    const beg = pattern.indexOf(BegCharClass, pos);
    if (beg < 0) {
        return undefined;
    }
    const end = pattern.indexOf(EndCharClass, beg);
    if (end < 0) {
        return undefined;
    }
    return {
        beg: beg,
        end: end + EndCharClass.length,
    };
}

function findCharClasses(pattern: string): Array<Boundaries> {
    const boundaries : Array<Boundaries> = [];
    let pos = 0;
    for (;;) {
        let b = findNextCharClass(pattern, pos);
        if (!b) {
            break;
        }
        boundaries.push(b);
        pos = b.end;
    }
    return boundaries;
}

function makeBasicWildcard(pattern: string): string {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    return escaped.replace(/\*/g, ".*")
}

function makeCharClasses(pattern: string, b: Boundaries): string {
    return "[" + pattern.substring(b.beg + BegCharClass.length, b.end - EndCharClass.length) + "]+"
}

export function makeRegexPattern(pattern: string): string {
    let full = ""
    const boundaries = findCharClasses(pattern)
    let pos = 0;
    for (const b of boundaries) {
        full += makeBasicWildcard(pattern.substring(pos, b.beg))
        full += makeCharClasses(pattern, b)
        pos = b.end
    }
    full += makeBasicWildcard(pattern.substring(pos))
    return "^" + full + "$";
}

export function tryCompileWildcardMatch(pattern: string) {
    if (pattern.length == 0) {
        return (x: string)=> x.trim().length == 0;
    }
    if (pattern == "*") {
        return (x: string)=> true;
    }
    try {
        const regex = new RegExp(makeRegexPattern(pattern.toLowerCase()))
        return (x: string)=> regex.exec(x.trim().toLowerCase()) != null;
    } catch (ex) {
        return false
    }
}

export function wildcardMatch(pattern: string) {
    const match = tryCompileWildcardMatch(pattern)
    if (! match) {
        throw new SyntaxError("failed to compile: '" + pattern + "'")
    }
    return match;
}
