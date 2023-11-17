result = """
# Outline
# Setting
The story unfolds in the vibrant Sylvarant Forest, a lush and vast woodland with babbling brooks, ancient trees, and a tapestry of flowers that bloom all year round. It is a hidden gem far away from human civilization, known only to the creatures that call it home. The forest is mysterious and holds many ancient secrets, including hidden paths that lead to enchanting clearings, and the Old Wispy Willow, the eldest and wisest tree in the forest.

# Main Characters
**Fiona the Fox** - A curious and sprightly young fox with a fiery red coat and an insatiable appetite for adventure. She is independent but learns the value of friendship and community throughout her journey.

**Oliver the Owl** - An old, wise owl who acts as the guardian of knowlege and the forest's historian. His character arc involves learning to leave his tree and participate more actively in the events of the forest, imparting his wisdom to help others.

**Luna the Rabbit** - A timid but intelligent rabbit with a white, fluffy coat who admires Fiona's bravery. She learns to overcome her fears and gains confidence as she aids Fiona on her quest.

**Benjamin the Bear** - A gentle giant with a deep rumbling voice that echoes through the forest. He embodies strength and has a heart of gold. Benjamin learns that despite his might, he sometimes needs help from his smaller friends, understanding the power of unity.

# Summary
The story begins with Fiona the Fox discovering a glowing gem nestled beneath the roots of the Old Wispy Willow. Compelled by its beauty, she takes the gem, unknowingly unlocking ancient magic that affects all of Sylvarant Forest. The once-peaceful flora and fauna begin to act strangely, caused by the disturbance of the forest's balance.

Fiona meets Oliver the Owl, who explains that the gem she found is actually the Heartstone, a magical item that maintains harmony in the forest. The disturbance now spreading can only be stopped by returning the Heartstone to its rightful place within the hidden Heartwood Glade.

Along her journey, Fiona enlists the help of Luna the Rabbit, overcoming dangerous obstacles together while forming a close bond. They are soon joined by Benjamin the Bear after saving him from a corrupted patch of forest affected by the imbalance.

Our group of unlikely friends face various challenges, from solving ancient riddles to navigating treacherous terrain. Fiona learns that despite her desire for independence, she needs her friends to succeed. Each friend plays a crucial role in reaching Heartwood Glade: Oliver provides knowledge, Luna offers cleverness, and Benjamin offers strength.

In a dramatic final challenge protecting the group from corrupted woodland creatures, they reach the Glade and Fiona places the gem back upon its pedestal. The forest is restored to its former glory, friendships are fortified, and our heroes return home as celebrated guardians of Sylvarant.

The story ends with the magical creatures hosting a grand celebration in honor of Fiona and her friends, cementing their new roles as defenders and champions of their woodland home. It's a heartwarming celebration of friendship, community, and inter-dependency.

# Tags
children's fiction, fantasy adventure, animal characters, magic, friendship, communityd
"""

import re

pattern = r"# Setting\n(.*?)\n\n# Main Characters\n(.*?)\n\n# Summary\n(.*?)\n\n# Tags\n(.*?)"
pattern = r"# Setting\n(.*?)\n\n# Main Characters\n(.*?)\n\n# Summary\n(.*?)\n\n# Tags\n(.*?)(?=\n|$)"

match = re.search(pattern, result, re.DOTALL)
print(match)
if match:
    print(match.group(3))

    # Everything except story base MUST be split before it is parsed.
def split_sections(string) -> dict:
    """
    Split the story outline into various sections based on predefined section delimiters.

    Thanks chatgpt.

    Args:
        string (str): The input text containing various sections.

    Returns:
        dict: Dictionary with each section and its content.
    """
    # List of permissible section delimiters
    section_delimiters = [
        '# Editing Notes',
        '# Outline',
        '# FactSheet',
        '# Characters',
        '# Scene',
    ]

    # Creating a regex pattern for the delimiters
    delimiter_pattern = '(' + '|'.join(re.escape(delimiter)
                                       for delimiter in section_delimiters) + ')'
    print("DELIMETER REGEX: ", delimiter_pattern)

    # Regex pattern to match sections
    pattern = fr"{delimiter_pattern}\n(.*?)(?=(\n{delimiter_pattern}\n)|$)"

    # Finding all matches
    matches = re.findall(pattern, string, re.DOTALL)

    sections = {}
    for match in matches:
        print(match)
        delimiter, content = match[0], match[1]
        sections[delimiter[2:].replace(" ", "_").lower()] = content.strip()

    return sections
print(split_sections(result))


