function getexpensehirearchyarray (rootName) {
    console.log(rootName);

    const ORG_NAMES = [
      ["Deepak Manodi", null],
    
      ["Shiv Ram Tathagat", "Deepak Manodi"],
      ["Gaurav Upadhyay", "Deepak Manodi"],
    
      ["Abhishek Sawhney", "Shiv Ram Tathagat"],
      ["Vibhav Upadhyay", "Shiv Ram Tathagat"],
      ["Navin Kumar Gautam", "Shiv Ram Tathagat"],
      ["Shambhavi Gupta", "Shiv Ram Tathagat"],
      ["Sankalp Choudhary", "Shiv Ram Tathagat"],
    
      ["Mohit Soni", "Abhishek Sawhney"],
    
      ["Kunal Kumar", "Navin Kumar Gautam"],
    
      ["Ketan Kumar Jha", "Gaurav Upadhyay"],
      ["Abhishek Sondhiya", "Gaurav Upadhyay"],
   
    ];
    
    function buildChildrenMap(pairs) {
      const children = new Map();
      for (const [child, parent] of pairs) {
        if (!children.has(parent)) children.set(parent, []);
        children.get(parent).push(child);
      }
      return children;
    }
    const ORG_CHILDREN_BY_NAME = buildChildrenMap(ORG_NAMES);
    
      if (!rootName) return [];
      const direct = ORG_CHILDREN_BY_NAME.get(rootName) || [];
      return Array.from(new Set([rootName, ...direct]));
}

module.exports = getexpensehirearchyarray