const TRANSLATOR = {
    extend: {
        r: 'right', l: 'left', b: 'both', n: 'none',
    },
    yLoc: { pr: 'price', ab: 'abovebar', bl: 'belowbar' },
    labelStyle: {
        n: 'none',
        xcr: 'xcross',
        cr: 'cross',
        tup: 'triangleup',
        tdn: 'triangledown',
        flg: 'flag',
        cir: 'circle',
        aup: 'arrowup',
        adn: 'arrowdown',
        lup: 'label_up',
        ldn: 'label_down',
        llf: 'label_left',
        lrg: 'label_right',
        llwlf: 'label_lower_left',
        llwrg: 'label_lower_right',
        luplf: 'label_upper_left',
        luprg: 'label_upper_right',
        lcn: 'label_center',
        sq: 'square',
        dia: 'diamond',
    },
    lineStyle: {
        sol: 'solid', dot: 'dotted', dsh: 'dashed', al: 'arrow_left', ar: 'arrow_right', ab: 'arrow_both',
    },
    boxStyle: { sol: 'solid', dot: 'dotted', dsh: 'dashed' },
};
/**
 * Converts raw indicator graphics into readable objects.
 * @param indexes Maps graphic X indexes to "bars back" positions.
 */
export function parseGraphics(raw = {}, indexes = []) {
    const values = (type) => Object.values(raw[type] ?? {});
    const x = (index) => indexes[index];
    return {
        labels: values('dwglabels').map((l) => ({
            id: l.id,
            x: x(l.x),
            y: l.y,
            yLoc: TRANSLATOR.yLoc[l.yl] ?? l.yl,
            text: l.t,
            style: TRANSLATOR.labelStyle[l.st] ?? l.st,
            color: l.ci,
            textColor: l.tci,
            size: l.sz,
            textAlign: l.ta,
            toolTip: l.tt,
        })),
        lines: values('dwglines').map((l) => ({
            id: l.id,
            x1: x(l.x1),
            y1: l.y1,
            x2: x(l.x2),
            y2: l.y2,
            extend: TRANSLATOR.extend[l.ex] ?? l.ex,
            style: TRANSLATOR.lineStyle[l.st] ?? l.st,
            color: l.ci,
            width: l.w,
        })),
        boxes: values('dwgboxes').map((b) => ({
            id: b.id,
            x1: x(b.x1),
            y1: b.y1,
            x2: x(b.x2),
            y2: b.y2,
            color: b.c,
            bgColor: b.bc,
            extend: TRANSLATOR.extend[b.ex] ?? b.ex,
            style: TRANSLATOR.boxStyle[b.st] ?? b.st,
            width: b.w,
            text: b.t,
            textSize: b.ts,
            textColor: b.tc,
            textVAlign: b.tva,
            textHAlign: b.tha,
            textWrap: b.tw,
        })),
        tables: values('dwgtables').map((t) => {
            const cells = [];
            for (const cell of values('dwgtablecells')) {
                if (cell.tid !== t.id)
                    continue;
                cells[cell.row] ??= [];
                cells[cell.row][cell.col] = {
                    id: cell.id,
                    text: cell.t,
                    width: cell.w,
                    height: cell.h,
                    textColor: cell.tc,
                    textHAlign: cell.tha,
                    textVAlign: cell.tva,
                    textSize: cell.ts,
                    bgColor: cell.bgc,
                };
            }
            return {
                id: t.id,
                position: t.pos,
                rows: t.rows,
                columns: t.cols,
                bgColor: t.bgc,
                frameColor: t.frmc,
                frameWidth: t.frmw,
                borderColor: t.brdc,
                borderWidth: t.brdw,
                cells,
            };
        }),
        horizLines: values('horizlines').map((h) => ({
            ...h,
            startIndex: x(h.startIndex),
            endIndex: x(h.endIndex),
        })),
        polygons: values('polygons').map((p) => ({
            ...p,
            points: (p.points ?? []).map((point) => ({ ...point, index: x(point.index) })),
        })),
        horizHists: values('hhists').map((h) => ({
            ...h,
            firstBarTime: x(h.firstBarTime),
            lastBarTime: x(h.lastBarTime),
        })),
        raw,
    };
}
/** Applies `graphicsCmds` (erase then create) to raw graphics in place. */
export function applyGraphicsCommands(graphics, commands) {
    for (const instruction of commands?.erase ?? []) {
        if (instruction.action === 'all') {
            if (!instruction.type) {
                for (const type of Object.keys(graphics))
                    graphics[type] = {};
            }
            else
                delete graphics[instruction.type];
        }
        else if (instruction.action === 'one' && instruction.type) {
            delete graphics[instruction.type]?.[instruction.id];
        }
    }
    for (const [type, groups] of Object.entries(commands?.create ?? {})) {
        graphics[type] ??= {};
        for (const group of groups ?? []) {
            for (const item of group.data ?? [])
                graphics[type][item.id] = item;
        }
    }
}
