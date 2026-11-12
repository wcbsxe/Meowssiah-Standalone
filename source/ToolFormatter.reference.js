({ calls, defaultText }) => {
  if (!Array.isArray(calls) || calls.length === 0) {
    return defaultText ?? '';
  }

  const unescapeJsonStr = str =>
    str
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');

  // 流式半截 JSON 字符串兜底提取器
  const parsePartialArgs = raw => {
    const res = {};
    const keyRegex = /"([a-zA-Z0-9_]+)"\s*:\s*"((?:\\.|[^"\\])*)/g;
    let m;
    while ((m = keyRegex.exec(raw)) !== null) {
      res[m[1]] = unescapeJsonStr(m[2]);
    }
    return res;
  };

  // 仅在此表中的字段才自动补齐对应标签；extra / story_body 及其他额外字段一律原样输出不包标签
  const tagMap = {
    think_nya: 'think_nya',
    game_content: 'game',
    game: 'game',
    options: 'options',
    summary: 'summary',
    comment: 'comment',
  };

  const wrapTag = (val, tag) => {
    const trimmed = String(val ?? '').trim();
    if (!trimmed || !tag) return trimmed;

    // 1. 若内容中已经带有目标标签 <tag>，直接原样返回，绝不重复包裹
    const hasTargetTag = new RegExp(`<${tag}[\\s>]`, 'i').test(trimmed);
    const hasTargetTagClose = new RegExp(`<\/${tag}[\\s>]`, 'i').test(trimmed);
    if (hasTargetTag && hasTargetTagClose) return trimmed;

    // 2. 若 comment 字段里模型用了 <details> 折叠块，也直接原样返回
    if (tag === 'comment' && /^<details[\s>]/i.test(trimmed)) {
      return trimmed;
    }

    // 3. 若用户在【<game>标签（可改）】里改成了别的自定义标签（如 <novel>...</novel>），检测首尾成对标签直接放行
    if (
      tag === 'game' &&
      /^<([a-zA-Z0-9_-]+)>[\s\S]*<\/\1>$/.test(trimmed)
    ) {
      return trimmed;
    }

    return `<${tag}>\n${trimmed}\n</${tag}>`;
  };

  return calls
    .map(call => {
      let args = call?.arguments;
      if (typeof args === 'string') {
        try {
          args = JSON.parse(args);
        } catch {
          args = parsePartialArgs(args);
        }
      }

      if (!args || typeof args !== 'object') {
        return typeof call?.arguments === 'string' ? call.arguments : '';
      }

      if (
        typeof args.content === 'string' &&
        Object.keys(args).length === 1
      ) {
        return args.content;
      }

      const priorityOrder = [
        'think_nya',
        'game_content',
        'game',
        'story_body',
        'extra',
        'options',
        'summary',
        'comment',
      ];
      const extraKeys = Object.keys(args).filter(
        k => !priorityOrder.includes(k) && k !== 'nya_oath'
      );
      const finalKeyOrder = [...priorityOrder, ...extraKeys];

      const parts = [];
      
      for (const key of finalKeyOrder) {
        if (!(key in args)) continue;
        let val = String(args[key] ?? '').trim();
        if (!val) continue;
      
        if (key === 'think_nya') {
          val = val
            .replace(/`{3,}/g, '')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        }
      
        const tag = tagMap[key] ?? null;
        parts.push(wrapTag(val, tag));
      }
      
      return parts.filter(Boolean).join('\n');
    })
    .filter(Boolean)
    .join('\n\n');
};